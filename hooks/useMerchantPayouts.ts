import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';

import { vendorsApi } from '@/data/api';
import type { MerchantPayoutStatus, MerchantPayoutSummary } from '@/data/api/vendors';
import { ApiError } from '@/data/http';
import { useT } from '@/lib/i18n/useT';

/**
 * Whether the shop's money has somewhere to go — the same four states as a
 * courier's (`useCourierPayouts`):
 *
 * - `unavailable` — the API could not ask Stripe (no key on this deploy, or the
 *   network). Said as such, not as "à configurer", which would send a merchant
 *   into a flow that cannot work.
 * - `setup` — never started, or started and abandoned on Stripe's form.
 * - `review` — the form is done and Stripe is still verifying.
 * - `active` — Stripe will pay the Friday transfer to their bank.
 */
export type MerchantPayoutState = 'loading' | 'unavailable' | 'setup' | 'review' | 'active';

export interface MerchantPayouts {
  state: MerchantPayoutState;
  /** What the next payment carries, and the last few. Null until read. */
  summary: MerchantPayoutSummary | null;
  /** Opens Stripe's hosted onboarding, then re-reads the status when it closes. */
  setUp: () => Promise<void>;
  settingUp: boolean;
  /** Why the last `setUp` failed, worded for the merchant. */
  error: string | null;
  reload: () => Promise<void>;
}

function toState(status: MerchantPayoutStatus): MerchantPayoutState {
  if (status.payoutsEnabled) return 'active';
  return status.onboarded ? 'review' : 'setup';
}

/**
 * The shop's payouts: the Stripe account the weekly transfer lands in, and
 * what is waiting for it.
 *
 * `active` is false until the shop is approved: the API refuses to open a
 * Connect account for a file an administrator may still reject.
 */
export function useMerchantPayouts(active: boolean): MerchantPayouts {
  const t = useT();
  const [state, setState] = useState<MerchantPayoutState>('loading');
  const [summary, setSummary] = useState<MerchantPayoutSummary | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!active) return;
    // Read independently: a deploy with no Stripe key still knows what is owed.
    const [status, owed] = await Promise.allSettled([vendorsApi.getPayoutStatus(), vendorsApi.getPayoutSummary()]);
    setState(status.status === 'fulfilled' ? toState(status.value) : 'unavailable');
    if (owed.status === 'fulfilled') setSummary(owed.value);
  }, [active]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setUp = useCallback(async () => {
    if (settingUp) return;
    setError(null);
    setSettingUp(true);
    try {
      const url = await vendorsApi.startPayoutOnboarding();
      // An auth session rather than a plain in-app browser: it closes by itself
      // when the API's return route redirects to `sougouba://payouts-return`.
      await WebBrowser.openAuthSessionAsync(url, vendorsApi.PAYOUT_RETURN_URL);
      // Whatever the browser reported — done, closed early, link expired —
      // Stripe is the one that knows how far the merchant got.
      await reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.genericError'));
    } finally {
      setSettingUp(false);
    }
  }, [settingUp, reload, t]);

  return { state, summary, setUp, settingUp, error, reload };
}
