import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import type { SettingsService } from '../loyalty/settings.service.js';
import { SettlementsService } from './settlements.service.js';

type Result = { data: unknown; error: { code: string; message: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });

const settings = { all: async () => ({ commissionRate: 0.12 }) } as unknown as SettingsService;

/** The addendum's order (§03): goods 32,50 $, taxes 4,87 $, delivery 4,99 $, total 42,36 $. */
const ORDER = { id: 'order-1', vendorId: 'shop-1', subtotalCad: 32.5, gstCad: 1.63, qstCad: 3.24, deliveryFeeCad: 4.99, totalCad: 42.36 };

function harness(setup: { missing?: unknown[][]; settlement?: unknown; upsert?: Result; refundRpc?: Result | Error } = {}) {
  const upserts: unknown[] = [];
  const pages = [...(setup.missing ?? [])];
  const rpc = vi.fn((name: string): Promise<Result> => {
    if (name === 'orders_missing_settlement') return Promise.resolve(ok(pages.shift() ?? []));
    if (name === 'order_settlement_refund') {
      if (setup.refundRpc instanceof Error) return Promise.reject(setup.refundRpc);
      return Promise.resolve(setup.refundRpc ?? ok('reduced'));
    }
    throw new Error(`unexpected rpc ${name}`);
  });
  const db = {
    rpc,
    from: () => ({
      upsert: (rows: unknown) => (upserts.push(rows), Promise.resolve(setup.upsert ?? ok(null))),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(ok(setup.settlement ?? null)) }) }),
    }),
  } as unknown as Db;
  return { service: new SettlementsService(db, settings), upserts, rpc };
}

describe('the shop\'s share, written when an order is placed', () => {
  it('stores what the shop is owed, by the split rule', async () => {
    const { service, upserts } = harness();

    await service.record(ORDER, 3.9);
    expect(upserts).toEqual([{ order_id: 'order-1', vendor_id: 'shop-1', share_cad: 33.47 }]);
  });

  it('never fails the order it belongs to', async () => {
    const { service } = harness({ upsert: { data: null, error: { code: '57014', message: 'timeout' } } });

    await expect(service.record(ORDER, 3.9)).resolves.toBeUndefined();
  });
});

describe('filling in orders that have no share yet', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'o1',
    vendor_id: 'shop-1',
    subtotal_cad: '32.50',
    gst_cad: '1.63',
    qst_cad: '3.24',
    delivery_fee_cad: '4.99',
    total_cad: '42.36',
    coupon_discount_cad: null,
    points_discount_cad: null,
    commission_cad: '3.90',
    refund_amount_cad: null,
    refunded_at: null,
    status: 'delivered',
    ...over,
  });

  it('uses the commission fixed at checkout, and today\'s rate only when there is none', async () => {
    const { service, upserts } = harness({
      missing: [[row({ id: 'o1', commission_cad: '3.25' }), row({ id: 'o2', commission_cad: null })]],
    });

    await expect(service.reconcile()).resolves.toBe(2);
    expect(upserts[0]).toEqual([
      { order_id: 'o1', vendor_id: 'shop-1', share_cad: 34.12, refund_cad: 0 },
      { order_id: 'o2', vendor_id: 'shop-1', share_cad: 33.47, refund_cad: 0 },
    ]);
  });

  it('starts an already-refunded delivered order with the shop\'s part of that refund', async () => {
    const { service, upserts } = harness({
      missing: [
        [
          row({ id: 'half', refunded_at: '2026-12-02T10:00:00Z', refund_amount_cad: '21.18' }),
          // A refund recorded without its amount is the whole order.
          row({ id: 'whole', refunded_at: '2026-12-02T10:00:00Z', refund_amount_cad: null }),
          // Refunded before it was ever delivered: there is no share to take from.
          row({ id: 'early', status: 'preparing', refunded_at: '2026-12-02T10:00:00Z', refund_amount_cad: '42.36' }),
        ],
      ],
    });

    await service.reconcile();
    expect((upserts[0] as { order_id: string; refund_cad: number }[]).map((r) => [r.order_id, r.refund_cad])).toEqual([
      ['half', 16.74],
      ['whole', 33.47],
      ['early', 0],
    ]);
  });

  it('writes nothing when every order already has its share', async () => {
    const { service, upserts } = harness({ missing: [[]] });

    await expect(service.reconcile()).resolves.toBe(0);
    expect(upserts).toEqual([]);
  });
});

describe('a refund after delivery', () => {
  const settlement = { share_cad: '33.47', order: { total_cad: '42.36' } };

  it('takes the shop\'s part of it — not the whole refund — off what the shop is owed', async () => {
    const { service, rpc } = harness({ settlement });

    await service.refundRecorded('order-1', 21.18);
    expect(rpc).toHaveBeenCalledWith('order_settlement_refund', { p_order_id: 'order-1', p_refund_share: 16.74 });
  });

  it('does nothing for an order no card paid for', async () => {
    const { service, rpc } = harness({ settlement: null });

    await service.refundRecorded('seeded-order', 10);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never throws — the shopper already has their money back', async () => {
    const { service } = harness({ settlement, refundRpc: new Error('database unreachable') });

    await expect(service.refundRecorded('order-1', 21.18)).resolves.toBeUndefined();
  });
});
