import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';

import { couriersApi } from '@/data/api';
import type { PayoutStatus } from '@/data/api/couriers';
import { ApiError } from '@/data/http';
import { useT } from '@/lib/i18n/useT';

/**
 * Where the courier's money is going, read as one of four states.
 *
 * - `unavailable` — the API could not ask Stripe (no key on this deploy, or the
 *   network). Said as such rather than as "à configurer", which would send a
 *   courier into a flow that cannot work.
 * - `setup` — never started, or started and abandoned on Stripe's form.
 * - `review` — the form is done and Stripe is still verifying.
 * - `active` — Stripe will pay the Friday transfer to their bank.
 */
export type PayoutState = 'loading' | 'unavailable' | 'setup' | 'review' | 'active';

export interface CourierPayouts {
  state: PayoutState;
  /** Delivered and not yet paid — what the next transfer carries. Null until read. */
  pendingCad: number | null;
  pendingRuns: number;
  /** Opens Stripe's hosted onboarding, then re-reads the status when it closes. */
  setUp: () => Promise<void>;
  settingUp: boolean;
  /** Why the last `setUp` failed, worded for the courier. */
  error: string | null;
  reload: () => Promise<void>;
}

function toState(status: PayoutStatus): PayoutState {
  if (status.payoutsEnabled) return 'active';
  return status.onboarded ? 'review' : 'setup';
}

/**
 * The courier's payouts: the Stripe account the Friday transfer lands in, and
 * the amount waiting for it.
 *
 * The bank details themselves never pass through the app or the API — Stripe's
 * hosted form collects them, and what comes back is a status. That is why the
 * signup no longer asks for a transit and account number.
 *
 * `active` is false until the courier's file is approved: the API refuses to
 * open a Connect account for a file an administrator may still reject.
 */
export function useCourierPayouts(active: boolean): CourierPayouts {
  const t = useT();
  const [state, setState] = useState<PayoutState>('loading');
  const [pending, setPending] = useState<{ cad: number; runs: number } | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!active) return;
    // Read independently: a deploy with no Stripe key still knows what is owed.
    const [status, owed] = await Promise.allSettled([
      couriersApi.getPayoutStatus(),
      couriersApi.getPendingPayout(),
    ]);
    setState(status.status === 'fulfilled' ? toState(status.value) : 'unavailable');
    if (owed.status === 'fulfilled') setPending({ cad: owed.value.pendingCad, runs: owed.value.runCount });
  }, [active]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setUp = useCallback(async () => {
    if (settingUp) return;
    setError(null);
    setSettingUp(true);
    try {
      const url = await couriersApi.startPayoutOnboarding();
      // An auth session rather than a plain in-app browser: it closes by itself
      // when the API's return route redirects to `sougouba://payouts-return`.
      await WebBrowser.openAuthSessionAsync(url, couriersApi.PAYOUT_RETURN_URL);
      // Whatever the browser reported — done, closed early, link expired —
      // Stripe is the one that knows how far the courier got.
      await reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.genericError'));
    } finally {
      setSettingUp(false);
    }
  }, [settingUp, reload, t]);

  return {
    state,
    pendingCad: pending?.cad ?? null,
    pendingRuns: pending?.runs ?? 0,
    setUp,
    settingUp,
    error,
    reload,
  };
}
