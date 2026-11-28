import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import type { SettingsService } from '../loyalty/settings.service.js';
import type { NotifyService } from '../notifications/notify.service.js';
import { SubscriptionEnforcementService } from './subscription-enforcement.service.js';

type ShopStatus = 'pending' | 'approved' | 'suspended' | 'rejected' | 'subscription_hold';
type Subscription = { status: 'inactive' | 'active' | 'past_due' | 'canceled'; past_due_since?: string | null };

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/**
 * A database holding shops and their subscriptions, the two settings, and a
 * `vendor_subscription_hold` that behaves as the real one does: it moves a
 * shop only from the status that direction expects, and says whether it did.
 */
function harness(setup: {
  shops: Record<string, ShopStatus>;
  subscriptions?: Record<string, Subscription>;
  required?: boolean;
  graceDays?: number;
  fee?: number;
  stripe?: boolean;
}) {
  const shops = new Map(Object.entries(setup.shops));
  const subscriptions = new Map(Object.entries(setup.subscriptions ?? {}));

  /** One PostgREST query: filters pile up, and it answers as a list or as one row. */
  function query(table: string) {
    let rows: Record<string, unknown>[] =
      table === 'vendors'
        ? [...shops].map(([id, status]) => ({ id, status }))
        : [...subscriptions].map(([vendor_id, row]) => ({ vendor_id, ...row }));
    const q = {
      select: () => q,
      order: () => q,
      eq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] === value)), q),
      in: (column: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[column]))), q),
      range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    };
    return q;
  }

  const rpc = vi.fn(async (_name: string, args: { p_vendor_id: string; p_hold: boolean; p_cause: string }) => {
    const expected = args.p_hold ? 'approved' : 'subscription_hold';
    if (shops.get(args.p_vendor_id) !== expected) return { data: false, error: null };
    shops.set(args.p_vendor_id, args.p_hold ? 'subscription_hold' : 'approved');
    return { data: true, error: null };
  });

  const settings = {
    all: async () => ({
      subscriptionRequired: setup.required ?? true,
      subscriptionGraceDays: setup.graceDays ?? 7,
      monthlySubscriptionCad: setup.fee ?? 70,
    }),
  } as unknown as SettingsService;
  const notify = { shopTakenOffline: vi.fn(async () => undefined), shopBackOnline: vi.fn(async () => undefined) };
  const config = { get: () => ((setup.stripe ?? true) ? 'sk_test_x' : undefined) } as unknown as ConfigService<Env, true>;

  const service = new SubscriptionEnforcementService(
    { from: query, rpc } as unknown as Db,
    settings,
    notify as unknown as NotifyService,
    config
  );
  return { service, shops, rpc, notify, status: (id: string) => shops.get(id) };
}

describe('one shop, settled', () => {
  it('goes offline when the subscription is required and it has none — and is told why', async () => {
    const h = harness({ shops: { a: 'approved' } });
    const result = await h.service.apply('a');

    expect(result.outcome).toBe('held');
    expect(h.status('a')).toBe('subscription_hold');
    expect(h.rpc).toHaveBeenCalledWith('vendor_subscription_hold', { p_vendor_id: 'a', p_hold: true, p_cause: 'never_subscribed' });
    expect(h.notify.shopTakenOffline).toHaveBeenCalledWith('a', 'never_subscribed');
  });

  it('comes back the moment its subscription is in order', async () => {
    const h = harness({ shops: { a: 'subscription_hold' }, subscriptions: { a: { status: 'active' } } });
    const result = await h.service.apply('a');

    expect(result.outcome).toBe('released');
    expect(h.status('a')).toBe('approved');
    expect(h.rpc).toHaveBeenCalledWith('vendor_subscription_hold', { p_vendor_id: 'a', p_hold: false, p_cause: 'in_order' });
    expect(h.notify.shopBackOnline).toHaveBeenCalledWith('a');
  });

  it('is left alone when it is already where it belongs', async () => {
    const paid = harness({ shops: { a: 'approved' }, subscriptions: { a: { status: 'active' } } });
    expect((await paid.service.apply('a')).outcome).toBe('unchanged');
    const unpaid = harness({ shops: { a: 'subscription_hold' } });
    expect((await unpaid.service.apply('a')).outcome).toBe('unchanged');

    expect(paid.rpc).not.toHaveBeenCalled();
    expect(unpaid.rpc).not.toHaveBeenCalled();
    expect(unpaid.notify.shopTakenOffline).not.toHaveBeenCalled();
  });

  it('keeps selling through the grace period after a failed renewal, then goes offline', async () => {
    const within = harness({ shops: { a: 'approved' }, subscriptions: { a: { status: 'past_due', past_due_since: daysAgo(2) } } });
    const result = await within.service.apply('a');
    expect(result.outcome).toBe('unchanged');
    expect(result.standing).toMatchObject({ inOrder: true, cause: 'past_due' });
    expect(result.standing.offlineAt).not.toBeNull();

    const after = harness({ shops: { a: 'approved' }, subscriptions: { a: { status: 'past_due', past_due_since: daysAgo(8) } } });
    expect((await after.service.apply('a')).outcome).toBe('held');
    expect(after.notify.shopTakenOffline).toHaveBeenCalledWith('a', 'past_due');
  });

  it('never touches a shop an administrator has pending, rejected or suspended', async () => {
    for (const status of ['pending', 'rejected', 'suspended'] as const) {
      const h = harness({ shops: { a: status } });
      const result = await h.service.apply('a');
      expect(result.outcome).toBe('unchanged');
      // Its owner's screen still shows where the subscription stands.
      expect(result.standing.cause).toBe('never_subscribed');
      expect(h.status('a')).toBe(status);
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });

  it('moves it without a message when the caller has one of its own to send', async () => {
    const h = harness({ shops: { a: 'approved' } });
    expect((await h.service.apply('a', { silent: true })).outcome).toBe('held');
    expect(h.notify.shopTakenOffline).not.toHaveBeenCalled();
  });

  it('reports nothing moved when someone else moved the shop first', async () => {
    const h = harness({ shops: { a: 'approved' } });
    // An administrator suspends it between the read and the write.
    h.rpc.mockImplementationOnce(async () => ({ data: false, error: null }));
    expect((await h.service.apply('a')).outcome).toBe('unchanged');
    expect(h.notify.shopTakenOffline).not.toHaveBeenCalled();
  });
});

describe('the rule', () => {
  it('is not in force while the administrator has not required the subscription', async () => {
    const h = harness({ shops: { a: 'approved' }, required: false });
    expect((await h.service.apply('a')).outcome).toBe('unchanged');
    expect(await h.service.rule()).toEqual({ required: false, graceDays: 7 });
  });

  it('is not in force when there is nothing a shop could subscribe to', async () => {
    // No fee: nothing to pay. No Stripe on this server: nowhere to pay it. Requiring
    // it then would take every shop offline with no way back.
    expect((await harness({ shops: {}, fee: 0 }).service.rule()).required).toBe(false);
    expect((await harness({ shops: {}, stripe: false }).service.rule()).required).toBe(false);
  });
});

describe('the pass over every shop', () => {
  const mixed = () =>
    harness({
      shops: {
        paid: 'approved',
        never: 'approved',
        late: 'approved',
        'too-late': 'approved',
        ended: 'approved',
        'paid-again': 'subscription_hold',
        'still-unpaid': 'subscription_hold',
        waiting: 'pending',
        banned: 'suspended',
      },
      subscriptions: {
        paid: { status: 'active' },
        late: { status: 'past_due', past_due_since: daysAgo(1) },
        'too-late': { status: 'past_due', past_due_since: daysAgo(30) },
        ended: { status: 'canceled' },
        'paid-again': { status: 'active' },
        'still-unpaid': { status: 'inactive' },
      },
    });

  it('takes offline every shop whose subscription is not in order, and brings back those that paid', async () => {
    const h = mixed();
    await expect(h.service.sweep()).resolves.toEqual({ held: 3, released: 1 });

    expect(Object.fromEntries(h.shops)).toEqual({
      paid: 'approved',
      never: 'subscription_hold',
      late: 'approved',
      'too-late': 'subscription_hold',
      ended: 'subscription_hold',
      'paid-again': 'approved',
      'still-unpaid': 'subscription_hold',
      waiting: 'pending',
      banned: 'suspended',
    });
    expect(h.notify.shopTakenOffline).toHaveBeenCalledTimes(3);
    expect(h.notify.shopBackOnline).toHaveBeenCalledTimes(1);
  });

  it('changes nothing the second time', async () => {
    const h = mixed();
    await h.service.sweep();
    h.rpc.mockClear();
    await expect(h.service.sweep()).resolves.toEqual({ held: 0, released: 0 });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('brings every held shop back when the rule is lifted', async () => {
    const h = harness({ shops: { a: 'subscription_hold', b: 'subscription_hold', c: 'approved' }, required: false });
    await expect(h.service.sweep()).resolves.toEqual({ held: 0, released: 2 });
    expect(h.rpc).toHaveBeenCalledWith('vendor_subscription_hold', { p_vendor_id: 'a', p_hold: false, p_cause: 'not_required' });
    expect([h.status('a'), h.status('b'), h.status('c')]).toEqual(['approved', 'approved', 'approved']);
  });

  it('carries on past a shop that could not be moved', async () => {
    const h = harness({ shops: { a: 'approved', b: 'approved' } });
    h.rpc.mockImplementationOnce(async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(h.service.sweep()).resolves.toEqual({ held: 1, released: 0 });
    expect(h.status('b')).toBe('subscription_hold');
  });
});

describe('what requiring the subscription would do', () => {
  it('counts the live shops with no subscription in order — while the rule is still off', async () => {
    const h = harness({
      required: false,
      shops: { paid: 'approved', never: 'approved', ended: 'approved', late: 'approved', waiting: 'pending' },
      subscriptions: {
        paid: { status: 'active' },
        ended: { status: 'canceled' },
        late: { status: 'past_due', past_due_since: daysAgo(1) },
      },
    });
    await expect(h.service.impact()).resolves.toEqual({ shops: 4, notInOrder: 2, enforceable: true, graceDays: 7 });
    // Asking moved nobody.
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('says when requiring it would do nothing at all', async () => {
    const h = harness({ required: false, shops: { a: 'approved' }, fee: 0 });
    expect((await h.service.impact()).enforceable).toBe(false);
  });
});
