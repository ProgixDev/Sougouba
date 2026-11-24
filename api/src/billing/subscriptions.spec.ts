import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { pickSubscription, subscriptionPriceKey, toBillingSubscription } from '../orders/payments.service.js';
import { localStatus } from './subscriptions.service.js';

describe('a Stripe subscription status, as the merchant is told it', () => {
  it('folds Stripe’s eight states into the four the app shows', () => {
    const all: Stripe.Subscription.Status[] = [
      'active',
      'trialing',
      'past_due',
      'unpaid',
      'canceled',
      'incomplete_expired',
      'incomplete',
      'paused',
    ];
    expect(Object.fromEntries(all.map((status) => [status, localStatus(status)]))).toEqual({
      active: 'active',
      // A trial is paid-up as far as the shop is concerned.
      trialing: 'active',
      past_due: 'past_due',
      // Where `past_due` lands once Stripe stops retrying: still owed, not "never subscribed".
      unpaid: 'past_due',
      canceled: 'canceled',
      incomplete_expired: 'canceled',
      // A checkout whose first payment has not gone through bought nothing yet.
      incomplete: 'inactive',
      paused: 'inactive',
    });
  });
});

describe('which subscription describes a customer', () => {
  const sub = (status: Stripe.Subscription.Status, created: number) => ({ status, created });

  it('is none for a customer who never had one', () => {
    expect(pickSubscription([])).toBeNull();
  });

  it('is the live one, even when a cancelled one is newer in the list', () => {
    // Cancelled in March, subscribed again in May, and an abandoned checkout since.
    const picked = pickSubscription([sub('canceled', 300), sub('active', 200), sub('incomplete_expired', 400)]);
    expect(picked).toEqual(sub('active', 200));
  });

  it('is the most recent when none is live', () => {
    expect(pickSubscription([sub('canceled', 100), sub('canceled', 300), sub('incomplete_expired', 200)])).toEqual(
      sub('canceled', 300)
    );
  });

  it('counts an overdue subscription as live — the shop still owes it', () => {
    expect(pickSubscription([sub('canceled', 500), sub('past_due', 100)])).toEqual(sub('past_due', 100));
  });
});

describe('the price a new subscription is created on', () => {
  it('is keyed by the amount, so changing the fee creates a new price instead of repricing subscribers', () => {
    expect(subscriptionPriceKey(70)).toBe('sougouba_merchant_monthly_cad_7000');
    expect(subscriptionPriceKey(80)).toBe('sougouba_merchant_monthly_cad_8000');
    expect(subscriptionPriceKey(69.99)).toBe('sougouba_merchant_monthly_cad_6999');
  });
});

describe('a Stripe subscription, read', () => {
  const stripeSubscription = (over: Partial<Stripe.Subscription> = {}) =>
    ({
      id: 'sub_123',
      status: 'active',
      cancel_at: null,
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: 1_800_000_000, price: { unit_amount: 7000 } }] },
      ...over,
    }) as unknown as Stripe.Subscription;

  it('takes the billing period from the item, where Stripe now keeps it', () => {
    expect(toBillingSubscription(stripeSubscription())).toEqual({
      id: 'sub_123',
      status: 'active',
      currentPeriodEnd: new Date(1_800_000_000 * 1000).toISOString(),
      cancelAt: null,
      priceCad: 70,
    });
  });

  it('reports when a cancelled subscription will actually stop', () => {
    const explicit = toBillingSubscription(stripeSubscription({ cancel_at: 1_800_500_000 }));
    expect(explicit.cancelAt).toBe(new Date(1_800_500_000 * 1000).toISOString());
    // "Cancel at period end" with no explicit date: it stops when the paid month does.
    const atPeriodEnd = toBillingSubscription(stripeSubscription({ cancel_at_period_end: true }));
    expect(atPeriodEnd.cancelAt).toBe(atPeriodEnd.currentPeriodEnd);
  });

  it('survives a subscription with no item', () => {
    const empty = toBillingSubscription(stripeSubscription({ items: { data: [] } } as never));
    expect(empty).toMatchObject({ currentPeriodEnd: null, cancelAt: null, priceCad: null });
  });
});
