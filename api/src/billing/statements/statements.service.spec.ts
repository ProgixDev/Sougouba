import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../db/client.js';
import type { SettingsService } from '../../loyalty/settings.service.js';
import type { MailService } from '../../mail/mail.service.js';
import type { SettlementsService } from '../../orders/settlements.service.js';
import { StatementsService } from './statements.service.js';

type Result = { data: unknown; error: null };
const ok = (data: unknown): Result => ({ data, error: null });

/**
 * Enough of the database to read a shop's month: the two account functions,
 * with every filter the ledger read was given written down.
 */
function harness(setup: { from?: string; opening?: number; ledger?: unknown[] } = {}) {
  const calls: { name: string; args: Record<string, unknown>; filters: [string, string, unknown][] }[] = [];
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    const call = { name, args, filters: [] as [string, string, unknown][] };
    calls.push(call);
    const result = name === 'merchant_balance_at' ? ok(setup.opening ?? 0) : ok(setup.ledger ?? []);
    const chain = {
      gte: (column: string, value: unknown) => (call.filters.push(['gte', column, value]), chain),
      lt: (column: string, value: unknown) => (call.filters.push(['lt', column, value]), chain),
      order: (column: string) => (call.filters.push(['order', column, null]), chain),
      range: (from: number, to: number) => (call.filters.push(['range', String(from), to]), chain),
      // A PostgREST builder is a thenable — that is what is being faked.
      // oxlint-disable-next-line unicorn/no-thenable
      then: (resolve: (v: Result) => void) => resolve(result),
    };
    return chain;
  });
  const table = (rows: unknown) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      maybeSingle: () => Promise.resolve(ok(rows)),
      // oxlint-disable-next-line unicorn/no-thenable
      then: (resolve: (v: Result) => void) => resolve(ok(rows)),
    };
    return chain;
  };
  const db = { rpc, from: (name: string) => table(name === 'vendors' ? { id: 'shop-1' } : []) } as unknown as Db;

  const settings = { all: async () => ({ commissionRate: 0.12 }) } as unknown as SettingsService;
  const reconcileIfStale = vi.fn(async () => undefined);
  const settlements = { reconcileIfStale, reconcile: vi.fn(async () => 0) } as unknown as SettlementsService;
  const config = { get: (key: string) => (key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'a-key-for-tests' : key === 'MERCHANT_PAYOUTS_FROM' ? setup.from : undefined) };

  const service = new StatementsService(db, settings, settlements, {} as MailService, config as never);
  return { service, calls, reconcileIfStale };
}

describe('a shop’s month so far', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-10T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('is read from the shop’s account: the balance when the month began, then the month’s lines', async () => {
    const { service, calls, reconcileIfStale } = harness({
      from: '2026-12-01',
      opening: 20,
      ledger: [
        { kind: 'order', at: '2026-12-03T17:00:00Z', ref_id: 'o1', amount_cad: 33.47, receipt_number: 12, subtotal_cad: 32.5, gst_cad: 1.63, qst_cad: 3.24, coupon_discount_cad: null },
        { kind: 'payout', at: '2026-12-04T08:00:00Z', ref_id: 'p1', amount_cad: -20 },
      ],
    });

    const { current } = await service.listFor('owner-1');

    expect(current.period).toBe('2026-12');
    expect(current.totals).toMatchObject({ openingCad: 20, earnedCad: 33.47, paidCad: 20, balanceCad: 33.47 });
    // Every paid order has its share before the account is read.
    expect(reconcileIfStale).toHaveBeenCalled();

    // December in Montréal, and the account starting where paying starts.
    const account = { p_vendor_id: 'shop-1', p_from: '2026-12-01T05:00:00.000Z' };
    const balance = calls.find((c) => c.name === 'merchant_balance_at')!;
    expect(balance.args).toEqual({ ...account, p_at: '2026-12-01T05:00:00.000Z' });
    const ledger = calls.find((c) => c.name === 'merchant_ledger')!;
    expect(ledger.args).toEqual(account);
    expect(ledger.filters).toEqual([
      ['gte', 'at', '2026-12-01T05:00:00.000Z'],
      ['lt', 'at', '2027-01-01T05:00:00.000Z'],
      ['order', 'at', null],
      ['order', 'kind', null],
      ['order', 'ref_id', null],
      ['range', '0', 999],
    ]);
  });

  it('reads the whole account, from the first order, while no start date is set', async () => {
    const { service, calls } = harness();

    await service.listFor('owner-1');
    expect(calls.find((c) => c.name === 'merchant_ledger')!.args).toEqual({ p_vendor_id: 'shop-1', p_from: undefined });
  });
});
