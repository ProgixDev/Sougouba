import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import type { PaymentsService } from '../orders/payments.service.js';
import { ConnectService } from './connect.service.js';

/** A shop's row in `merchant_subscriptions`, and what Stripe says about its account. */
function harness(setup: { accountId?: string | null; stripe?: { payoutsEnabled: boolean; detailsSubmitted: boolean } | Error; configured?: boolean }) {
  const row = setup.accountId === undefined ? null : { stripe_connect_account_id: setup.accountId };
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }) }),
  } as unknown as Db;
  const getConnectAccount = vi.fn(async () => {
    if (setup.stripe instanceof Error) throw setup.stripe;
    return { chargesEnabled: false, ...(setup.stripe ?? { payoutsEnabled: false, detailsSubmitted: false }) };
  });
  const payments = { isConfigured: setup.configured ?? true, getConnectAccount } as unknown as PaymentsService;
  return { service: new ConnectService(db, payments), getConnectAccount };
}

describe('a shop’s Stripe account, as the back office reads it', () => {
  it('has not been started while the shop has no account — without asking Stripe', async () => {
    const { service, getConnectAccount } = harness({});
    await expect(service.vendorPayoutState('shop-1')).resolves.toEqual({ state: 'not_started' });

    const blank = harness({ accountId: null });
    await expect(blank.service.vendorPayoutState('shop-1')).resolves.toEqual({ state: 'not_started' });
    expect(getConnectAccount).not.toHaveBeenCalled();
  });

  it('is unfinished, under review, or active — as Stripe says', async () => {
    const state = (stripe: { payoutsEnabled: boolean; detailsSubmitted: boolean }) =>
      harness({ accountId: 'acct_1', stripe }).service.vendorPayoutState('shop-1');

    await expect(state({ detailsSubmitted: false, payoutsEnabled: false })).resolves.toEqual({ state: 'onboarding' });
    await expect(state({ detailsSubmitted: true, payoutsEnabled: false })).resolves.toEqual({ state: 'review' });
    await expect(state({ detailsSubmitted: true, payoutsEnabled: true })).resolves.toEqual({ state: 'active' });
  });

  it('says it does not know, rather than "not linked", when Stripe cannot be asked', async () => {
    await expect(harness({ accountId: 'acct_1', stripe: new Error('timeout') }).service.vendorPayoutState('shop-1')).resolves.toEqual({
      state: 'unavailable',
    });
    await expect(harness({ accountId: 'acct_1', configured: false }).service.vendorPayoutState('shop-1')).resolves.toEqual({
      state: 'unavailable',
    });
  });
});
