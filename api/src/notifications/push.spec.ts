import { afterEach, describe, expect, it, vi } from 'vitest';

import { orderReference as appOrderReference } from '../../../lib/orderRef.js';
import {
  courierCopy,
  customerCopy,
  merchantCopy,
  money,
  orderReference,
} from './messages.js';
import { PushService } from './push.service.js';

describe('orderReference', () => {
  it("matches the app's reference byte for byte, so a push and a receipt name the order alike", () => {
    for (const id of [
      '1f0c8a52-6c2e-4f6b-9a51-2b7e3d1c9e01',
      'ord_g3_004',
      'x',
    ]) {
      expect(orderReference(id)).toBe(appOrderReference({ id } as never));
    }
  });
});

describe('copy', () => {
  it('writes dollars the way each language does', () => {
    expect(money(12.5, 'fr')).toMatch(/^12,50\s\$$/);
    expect(money(12.5, 'en')).toBe('$12.50');
  });

  it('pluralises the merchant line', () => {
    expect(
      merchantCopy.newOrder({ ref: '#A1B2', items: 1, totalCad: 9 }, 'fr').body,
    ).toContain('1 article ·');
    expect(
      merchantCopy.newOrder({ ref: '#A1B2', items: 3, totalCad: 9 }, 'en').body,
    ).toContain('3 items');
  });

  it('renders each event in both languages', () => {
    const params = { ref: '#A1B2', vendor: 'Épicerie Dakar' };
    expect(customerCopy.confirmed(params, 'fr').title).toBe(
      'Commande acceptée',
    );
    expect(customerCopy.confirmed(params, 'en').title).toBe('Order accepted');
    expect(
      courierCopy.newOffer({ vendor: 'X', km: 2.345, earningsCad: 7 }, 'fr')
        .body,
    ).toContain('2,3 km');
  });
});

/**
 * Just enough of a PostgREST builder for `send`: records the filters applied
 * and resolves to the rows given, and records deletes.
 */
function fakeDb(rows: { token: string; locale: string }[]) {
  const deleted: string[][] = [];
  const filters: [string, unknown][] = [];
  const select = {
    in: (column: string, value: unknown) => (
      filters.push([column, value]),
      select
    ),
    eq: (column: string, value: unknown) => (
      filters.push([column, value]),
      select
    ),
    // A PostgREST builder *is* a thenable — that is what is being faked.
    // oxlint-disable-next-line unicorn/no-thenable
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: rows, error: null }),
  };
  const db = {
    from: () => ({
      select: () => select,
      delete: () => ({
        in: (_: string, tokens: string[]) => (
          deleted.push(tokens),
          Promise.resolve({ data: null, error: null })
        ),
      }),
    }),
  };
  return { db, deleted, filters };
}

const config = { get: () => undefined };

describe('PushService.send', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders per device language, honours the switch, and forgets tokens Expo says are gone', async () => {
    const { db, deleted, filters } = fakeDb([
      { token: 'ExponentPushToken[fr]', locale: 'fr' },
      { token: 'ExponentPushToken[en]', locale: 'en' },
    ]);
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetch);

    await new PushService(db as never, config as never).send(['u1', 'u1'], {
      content: (l) => customerCopy.delivered({ ref: '#A1B2', vendor: 'V' }, l),
      url: '/(customer)/order/1',
      channel: 'orders',
      category: 'orderUpdates',
    });

    expect(filters).toContainEqual(['user_id', ['u1']]);
    expect(filters).toContainEqual(['order_updates', true]);

    const sent = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(sent.map((m: { title: string }) => m.title)).toEqual([
      'Commande livrée',
      'Order delivered',
    ]);
    expect(sent[0].data).toEqual({ url: '/(customer)/order/1' });

    expect(deleted).toEqual([['ExponentPushToken[en]']]);
  });

  it('never throws, even when Expo is down', async () => {
    const { db } = fakeDb([{ token: 'ExponentPushToken[a]', locale: 'fr' }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('ECONNRESET'))),
    );
    await expect(
      new PushService(db as never, config as never).send(['u1'], {
        content: () => ({ title: 't', body: 'b' }),
        url: '/',
        channel: 'offers',
      }),
    ).resolves.toBeUndefined();
  });

  it('skips the database entirely when nobody is addressed', async () => {
    const from = vi.fn();
    await new PushService({ from } as never, config as never).send([], {
      content: () => ({ title: 't', body: 'b' }),
      url: '/',
      channel: 'orders',
    });
    expect(from).not.toHaveBeenCalled();
  });
});
