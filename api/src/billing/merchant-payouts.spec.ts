import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import type { PaymentsService } from '../orders/payments.service.js';
import type { SettlementsService } from '../orders/settlements.service.js';
import { MerchantPayoutsService, nextPayoutDate } from './merchant-payouts.service.js';

type Result = { data: unknown; error: { code: string; message: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });

/** A row of `merchant_payouts_owed`. */
const owes = (vendor: string, pending: number, account: string | null = `acct_${vendor}`) => ({
  vendor_id: vendor,
  vendor_name: `Shop ${vendor}`,
  pending_cad: pending,
  order_count: 2,
  adjustments_cad: 0,
  oldest_at: '2026-12-01T10:00:00Z',
  account_id: account,
});

/**
 * Enough of the database for a run: the RPCs answer from `rpc`, a read of a
 * table answers from `tables`, and every update is recorded.
 */
function harness(setup: {
  from?: string | null;
  owed?: ReturnType<typeof owes>[];
  /** What `merchant_payout_claim` answers per shop; default: a fresh claim for what is owed. */
  claims?: Record<string, { payout_id: string; amount_cad: number } | null | Error>;
  open?: { id: string; vendor_id: string; amount_cad: number }[];
  accounts?: { vendor_id: string; stripe_connect_account_id: string | null }[];
  markPaid?: Result;
  existingTransfers?: Record<string, string>;
  refuse?: string[];
  notReady?: string[];
}) {
  const rpc = vi.fn((name: string, args: Record<string, unknown>): Promise<Result> => {
    if (name === 'merchant_payouts_owed') return Promise.resolve(ok(setup.owed ?? []));
    if (name === 'merchant_payout_release') return Promise.resolve(ok(true));
    if (name === 'merchant_payout_claim') {
      const vendor = args.p_vendor_id as string;
      const claim = setup.claims && vendor in setup.claims ? setup.claims[vendor] : undefined;
      if (claim instanceof Error) return Promise.resolve({ data: null, error: { code: '40001', message: claim.message } });
      if (claim === null) return Promise.resolve(ok([]));
      const owed = (setup.owed ?? []).find((o) => o.vendor_id === vendor);
      const row = claim ?? { payout_id: `payout-${vendor}`, amount_cad: owed?.pending_cad ?? 0 };
      return Promise.resolve(ok([{ ...row, order_count: 2, resumed: false, claimed_at: '2026-12-04T08:00:00Z' }]));
    }
    throw new Error(`unexpected rpc ${name}`);
  });

  const updates: { table: string; values: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const tables: Record<string, unknown[]> = {
    merchant_payouts: setup.open ?? [],
    merchant_subscriptions: setup.accounts ?? [],
  };
  // A PostgREST builder is a thenable — that is what is being faked.
  const reader = (rows: unknown[]) => {
    // oxlint-disable-next-line unicorn/no-thenable
    const chain = { eq: () => chain, in: () => chain, then: (resolve: (v: Result) => void) => resolve(ok(rows)) };
    return chain;
  };
  const db = {
    rpc,
    from: (table: string) => ({
      select: () => reader(tables[table] ?? []),
      update: (values: Record<string, unknown>) => {
        const entry = { table, values, filters: [] as [string, unknown][] };
        updates.push(entry);
        const chain = {
          eq: (column: string, value: unknown) => (entry.filters.push([column, value]), chain),
          // oxlint-disable-next-line unicorn/no-thenable
          then: (resolve: (v: Result) => void) => resolve(setup.markPaid ?? ok(null)),
        };
        return chain;
      },
    }),
  } as unknown as Db;

  const transfer = vi.fn(async (input: { accountId: string; amountCents: number; idempotencyKey: string; transferGroup?: string }) => {
    if ((setup.refuse ?? []).includes(input.accountId)) throw new Error('balance_insufficient');
    return `tr_${input.accountId}`;
  });
  const findTransfer = vi.fn(async (group: string) => setup.existingTransfers?.[group] ?? null);
  const getConnectAccount = vi.fn(async (accountId: string) => ({ payoutsEnabled: !(setup.notReady ?? []).includes(accountId) }));
  const payments = { transfer, findTransfer, getConnectAccount } as unknown as PaymentsService;

  const reconcile = vi.fn(async () => 0);
  const settlements = { reconcile } as unknown as SettlementsService;
  const from = setup.from === undefined ? '2026-12-01' : setup.from;
  const config = { get: () => from ?? undefined };

  const service = new MerchantPayoutsService(db, payments, settlements, config as never);
  const rpcCalls = (name: string) => rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args);
  return { service, rpc, rpcCalls, updates, transfer, findTransfer, getConnectAccount, reconcile };
}

const FRIDAY = new Date('2026-12-04T08:00:00Z');

describe('paying the shops — the weekly run', () => {
  it('pays nothing at all until the day paying starts has been set', async () => {
    const { service, rpc, transfer } = harness({ from: null, owed: [owes('a', 50)] });

    await expect(service.runBatch({ trigger: 'schedule' }, FRIDAY)).resolves.toEqual({
      enabled: false,
      paid: 0,
      skipped: 0,
      failed: 0,
      totalCad: 0,
    });
    // Not even a look: on go-live day the database is full of test orders.
    expect(rpc).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
  });

  it('claims what a shop is owed, transfers exactly that, then marks it paid', async () => {
    const { service, rpcCalls, transfer, updates, reconcile } = harness({ owed: [owes('a', 48.47)] });

    const result = await service.runBatch({ trigger: 'schedule' }, FRIDAY);

    expect(result).toEqual({ enabled: true, paid: 1, skipped: 0, failed: 0, totalCad: 48.47 });
    // Every paid order has its share before anyone is asked what is owed.
    expect(reconcile).toHaveBeenCalled();
    expect(rpcCalls('merchant_payout_claim')).toEqual([
      { p_vendor_id: 'a', p_from: '2026-12-01T00:00:00.000Z', p_trigger: 'schedule', p_actor_id: undefined },
    ]);
    // The key and the group are the payout itself: a retry is the same transfer, and it can be found again.
    expect(transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct_a',
        amountCents: 4847,
        idempotencyKey: 'merchant-payout:payout-a',
        transferGroup: 'merchant-payout:payout-a',
      })
    );
    expect(updates).toEqual([
      {
        table: 'merchant_payouts',
        values: expect.objectContaining({ status: 'paid', stripe_transfer_id: 'tr_acct_a' }),
        // Only an open payout can become paid.
        filters: [
          ['id', 'payout-a'],
          ['status', 'pending'],
        ],
      },
    ]);
  });

  it('leaves a shop with no Stripe account, or one Stripe has not cleared, to keep accruing — and claims nothing for it', async () => {
    const { service, rpcCalls, transfer } = harness({
      owed: [owes('a', 30, null), owes('b', 20), owes('c', 10)],
      notReady: ['acct_b'],
    });

    const result = await service.runBatch({ trigger: 'schedule' }, FRIDAY);

    expect(result).toMatchObject({ paid: 1, skipped: 2, failed: 0, totalCad: 10 });
    // A claim reserves orders; reserving them for an account that cannot be paid would only hide them.
    expect(rpcCalls('merchant_payout_claim').map((c) => c.p_vendor_id)).toEqual(['c']);
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it('does not pay a shop that owes more in refunds than it has earned since', async () => {
    const { service, rpcCalls, getConnectAccount } = harness({ owed: [owes('a', -4), owes('b', 0)] });

    await expect(service.runBatch({ trigger: 'schedule' }, FRIDAY)).resolves.toMatchObject({ paid: 0, skipped: 0, failed: 0 });
    expect(rpcCalls('merchant_payout_claim')).toEqual([]);
    expect(getConnectAccount).not.toHaveBeenCalled();
  });

  it('hands the orders back when Stripe refuses, and still pays the next shop', async () => {
    const { service, rpcCalls, updates } = harness({ owed: [owes('a', 30), owes('b', 20)], refuse: ['acct_a'] });

    const result = await service.runBatch({ trigger: 'schedule' }, FRIDAY);

    expect(result).toMatchObject({ paid: 1, failed: 1, totalCad: 20 });
    expect(rpcCalls('merchant_payout_release')).toEqual([{ p_payout_id: 'payout-a', p_error: 'balance_insufficient' }]);
    // Shop A's payout is never marked paid.
    expect(updates.map((u) => u.filters[0])).toEqual([['id', 'payout-b']]);
  });

  it('pays nothing when the claim comes back empty — a refund got in first', async () => {
    const { service, transfer } = harness({ owed: [owes('a', 5)], claims: { a: null } });

    await expect(service.runBatch({ trigger: 'schedule' }, FRIDAY)).resolves.toMatchObject({ paid: 0, failed: 0 });
    expect(transfer).not.toHaveBeenCalled();
  });

  it('counts a claim the database refused as a failure and moves on', async () => {
    const { service, transfer } = harness({ owed: [owes('a', 5), owes('b', 7)], claims: { a: new Error('deadlock') } });

    await expect(service.runBatch({ trigger: 'schedule' }, FRIDAY)).resolves.toMatchObject({ paid: 1, failed: 1, totalCad: 7 });
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it('records who pressed the button', async () => {
    const { service, rpcCalls } = harness({ owed: [owes('a', 5)] });

    await service.runBatch({ trigger: 'admin', actorId: 'admin-1' }, FRIDAY);
    expect(rpcCalls('merchant_payout_claim')[0]).toMatchObject({ p_trigger: 'admin', p_actor_id: 'admin-1' });
  });
});

describe('paying the shops — a payout an earlier run left open', () => {
  const open = [{ id: 'payout-old', vendor_id: 'a', amount_cad: 48.47 }];
  const accounts = [{ vendor_id: 'a', stripe_connect_account_id: 'acct_a' }];

  it('finishes the record, without sending again, when Stripe already has the transfer', async () => {
    const { service, transfer, updates } = harness({
      open,
      accounts,
      existingTransfers: { 'merchant-payout:payout-old': 'tr_already_sent' },
    });

    const result = await service.runBatch({ trigger: 'schedule' }, FRIDAY);

    expect(result).toMatchObject({ paid: 1, failed: 0, totalCad: 48.47 });
    // The money left last time. Sending it again would pay the shop twice.
    expect(transfer).not.toHaveBeenCalled();
    expect(updates[0].values).toMatchObject({ status: 'paid', stripe_transfer_id: 'tr_already_sent' });
  });

  it('sends it when Stripe has no such transfer — the last run stopped before the money moved', async () => {
    const { service, transfer } = harness({ open, accounts });

    await expect(service.runBatch({ trigger: 'schedule' }, FRIDAY)).resolves.toMatchObject({ paid: 1, totalCad: 48.47 });
    expect(transfer).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 4847, idempotencyKey: 'merchant-payout:payout-old' }));
  });

  it('does not start a second payout for a shop whose first is still open', async () => {
    const { service, rpcCalls } = harness({ open, accounts, owed: [owes('a', 12)] });

    await service.runBatch({ trigger: 'schedule' }, FRIDAY);
    expect(rpcCalls('merchant_payout_claim')).toEqual([]);
  });

  it('hands the orders back when the shop no longer has a Stripe account to send to', async () => {
    const { service, rpcCalls, transfer } = harness({ open, accounts: [] });

    await expect(service.runBatch({ trigger: 'schedule' }, FRIDAY)).resolves.toMatchObject({ paid: 0, failed: 1 });
    expect(transfer).not.toHaveBeenCalled();
    expect(rpcCalls('merchant_payout_release')).toHaveLength(1);
  });

  it('keeps the orders claimed when the money went but the record did not — so the next run finishes it instead of paying again', async () => {
    const { service, rpcCalls } = harness({
      owed: [owes('a', 30)],
      markPaid: { data: null, error: { code: '57014', message: 'timeout' } },
    });

    await expect(service.runBatch({ trigger: 'schedule' }, FRIDAY)).resolves.toMatchObject({ paid: 0, failed: 1 });
    // Releasing here would put paid-for orders back in the pool.
    expect(rpcCalls('merchant_payout_release')).toEqual([]);
  });
});

describe('what the back office and the shop are shown', () => {
  it('lists nothing as owed, and says why, while paying is not switched on', async () => {
    const { service, rpc } = harness({ from: null });

    await expect(service.owed()).resolves.toEqual({ enabled: false, from: null, shops: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lists each shop with what it is owed and whether it can be paid', async () => {
    const { service } = harness({ owed: [owes('a', 48.47), owes('b', -4, null)] });

    await expect(service.owed()).resolves.toEqual({
      enabled: true,
      from: '2026-12-01',
      shops: [
        expect.objectContaining({ vendorId: 'a', pendingCad: 48.47, hasStripeAccount: true }),
        expect.objectContaining({ vendorId: 'b', pendingCad: -4, hasStripeAccount: false }),
      ],
    });
  });
});

describe('nextPayoutDate', () => {
  it('is the coming Friday, and today when today is one', () => {
    expect(nextPayoutDate(new Date('2026-11-30T12:00:00Z'))).toBe('2026-12-04'); // Monday
    expect(nextPayoutDate(new Date('2026-12-04T23:30:00Z'))).toBe('2026-12-04'); // Friday
    expect(nextPayoutDate(new Date('2026-12-05T00:10:00Z'))).toBe('2026-12-11'); // Saturday
  });
});
