import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { PaymentsService } from '../orders/payments.service.js';
import { roundCad, toStripeAmount } from '../orders/pricing.js';
import { SettlementsService } from '../orders/settlements.service.js';
import { PAYOUT_WEEKDAY } from './payouts.service.js';

/** Why a shop with money owed was not paid this time. */
export type MerchantPayoutBlock = 'no_account' | 'not_ready';

export interface MerchantPayoutRunResult {
  /** False while `MERCHANT_PAYOUTS_FROM` is unset: nothing is paid, by design. */
  enabled: boolean;
  paid: number;
  /** Shops owed money that could not receive it yet — no Stripe account, or one Stripe has not cleared. */
  skipped: number;
  failed: number;
  totalCad: number;
}

export interface MerchantOwed {
  vendorId: string;
  vendorName: string;
  /** What the next payment would be. Negative when refunds outweigh what has been delivered since. */
  pendingCad: number;
  orderCount: number;
  adjustmentsCad: number;
  oldestAt: string | null;
  hasStripeAccount: boolean;
}

export interface MerchantPayoutRecord {
  id: string;
  amountCad: number;
  orderCount: number;
  status: 'pending' | 'paid' | 'failed';
  createdAt: string;
  paidAt: string | null;
}

interface OwedRow {
  vendor_id: string;
  vendor_name: string;
  pending_cad: string | number;
  order_count: number;
  adjustments_cad: string | number;
  oldest_at: string | null;
  account_id: string | null;
}

interface ClaimRow {
  payout_id: string;
  amount_cad: string | number;
  order_count: number;
  resumed: boolean;
  claimed_at: string;
}

/**
 * Paying the shops — once a week, after delivery, for everything delivered
 * since the last payment (`drizzle/0059_merchant_payouts.sql` has the why).
 *
 * The sibling of `PayoutsService`, which pays couriers the same Friday. It is
 * its own class rather than a second mode of that one because what is owed is
 * worked out differently — a courier's pay is a figure on a delivery; a shop's
 * is its share of an order, less refunds, less whatever it was overpaid last
 * time — and because the money here is larger and the claim is stricter.
 *
 * The order of operations, and it is the whole design:
 *
 *   1. **claim** — the database reserves the shop's unpaid, delivered orders
 *      into one payout row and says what it comes to;
 *   2. **transfer** — Stripe moves that amount, under a key that is the payout;
 *   3. **settle** — the payout is marked paid.
 *
 * Nothing is paid that was not first claimed, so the orders a transfer covers
 * are fixed before the money moves. And a payout left open by a crash between
 * 1 and 3 is picked up by the next run, which first asks Stripe whether the
 * transfer already exists — so it is finished, never repeated.
 */
@Injectable()
export class MerchantPayoutsService {
  private readonly logger = new Logger(MerchantPayoutsService.name);
  private warnedDisabled = false;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService,
    private readonly settlements: SettlementsService,
    private readonly config: ConfigService<Env, true>
  ) {}

  /**
   * The day paying shops starts — `MERCHANT_PAYOUTS_FROM` — or null while it
   * has not been decided.
   *
   * A date, not a switch, because of what the database holds on the day real
   * payments begin: every order delivered while Stripe was in test mode. Those
   * were paid with test cards; a payout run that counted them would send real
   * money for them. Orders delivered before this date are simply not owed
   * through here.
   */
  private get from(): Date | null {
    const value = this.config.get('MERCHANT_PAYOUTS_FROM', { infer: true });
    if (!value) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // ── what each shop is owed ────────────────────────────────────────────────

  /** Every shop with something owed either way, largest first — the back office's list. */
  async owed(): Promise<{ enabled: boolean; from: string | null; shops: MerchantOwed[] }> {
    const from = this.from;
    if (!from) return { enabled: false, from: null, shops: [] };
    await this.settlements.reconcile();
    const rows = await unwrap<OwedRow[]>(this.db.rpc('merchant_payouts_owed', { p_from: from.toISOString() }));
    return { enabled: true, from: from.toISOString().slice(0, 10), shops: rows.map(toOwed) };
  }

  /** Every payment made or tried, newest first. */
  async history(query: { limit: number; offset: number; vendorId?: string }) {
    let builder = this.db
      .from('merchant_payouts')
      .select(
        'id, vendorId:vendor_id, amountCad:amount_cad, orderCount:order_count, adjustmentsCad:adjustments_cad, status, trigger, reason, error, stripeTransferId:stripe_transfer_id, createdAt:created_at, paidAt:paid_at, vendor:vendors(name)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.vendorId) builder = builder.eq('vendor_id', query.vendorId);

    const { data, count, error } = await builder;
    if (error) return unwrap<never>(Promise.resolve({ data: null, error }));
    return { items: data ?? [], total: count ?? 0, limit: query.limit, offset: query.offset };
  }

  /**
   * The merchant's own view: whether Stripe can pay them, what the next
   * payment would be, when, and the last few.
   */
  async summaryFor(userId: string) {
    const vendor = await unwrap<{ id: string } | null>(this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle());
    if (!vendor) throw new NotFoundException('This account has no shop');

    const from = this.from;
    let pendingCad = 0;
    let orderCount = 0;
    if (from) {
      await this.settlements.reconcile();
      const [row] = await unwrap<OwedRow[]>(
        this.db.rpc('merchant_payouts_owed', { p_from: from.toISOString(), p_vendor_id: vendor.id })
      );
      pendingCad = row ? roundCad(Number(row.pending_cad)) : 0;
      orderCount = row?.order_count ?? 0;
    }

    const recent = await unwrap<
      { id: string; amount_cad: string | number; order_count: number; status: MerchantPayoutRecord['status']; created_at: string; paid_at: string | null }[]
    >(
      this.db
        .from('merchant_payouts')
        .select('id, amount_cad, order_count, status, created_at, paid_at')
        .eq('vendor_id', vendor.id)
        // A payment Stripe refused went back into the balance; showing it here
        // would read as money lost.
        .in('status', ['paid', 'pending'])
        .order('created_at', { ascending: false })
        .limit(10)
    );

    return {
      /** False until the platform has set the date paying starts. */
      enabled: from !== null,
      pendingCad,
      orderCount,
      nextPayoutOn: nextPayoutDate(new Date()),
      payouts: recent.map(
        (p): MerchantPayoutRecord => ({
          id: p.id,
          amountCad: Number(p.amount_cad),
          orderCount: p.order_count,
          status: p.status,
          createdAt: p.created_at,
          paidAt: p.paid_at,
        })
      ),
    };
  }

  // ── the weekly run ────────────────────────────────────────────────────────

  /**
   * Pay every shop that is owed money and can receive it.
   *
   * One shop's trouble never stops the others: each is paid on its own, and a
   * failure is recorded and stepped over. A shop with no Stripe account, or
   * one Stripe has not finished checking, is not an error — it keeps accruing
   * and is paid by the first run after that changes.
   */
  async runBatch(opts: { trigger: 'schedule' | 'admin'; actorId?: string }, now: Date = new Date()): Promise<MerchantPayoutRunResult> {
    const from = this.from;
    if (!from) {
      if (!this.warnedDisabled) {
        this.warnedDisabled = true;
        this.logger.warn('Shops are not being paid: MERCHANT_PAYOUTS_FROM is unset. Set it to the day paying should start.');
      }
      return { enabled: false, paid: 0, skipped: 0, failed: 0, totalCad: 0 };
    }

    const result: MerchantPayoutRunResult = { enabled: true, paid: 0, skipped: 0, failed: 0, totalCad: 0 };
    const batchKey = now.toISOString().slice(0, 10);

    // 1. Finish what an earlier run left open, before claiming anything new.
    const open = await unwrap<{ id: string; vendor_id: string; amount_cad: string | number }[]>(
      this.db.from('merchant_payouts').select('id, vendor_id, amount_cad').eq('status', 'pending')
    );
    const resumed = new Set<string>();
    if (open.length > 0) {
      const accounts = await this.accountsOf(open.map((p) => p.vendor_id));
      for (const payout of open) {
        resumed.add(payout.vendor_id);
        const accountId = accounts.get(payout.vendor_id);
        if (!accountId) {
          // Claimed for an account that has since gone: nothing can be sent,
          // and nothing was (a transfer needs a destination). Hand it back.
          await this.release(payout.id, 'Le compte Stripe du commerce n’existe plus');
          result.failed++;
          continue;
        }
        await this.pay({ payoutId: payout.id, vendorId: payout.vendor_id, accountId, amountCad: Number(payout.amount_cad), batchKey }, result);
      }
    }

    // 2. Make sure every paid order has its share, then see who is owed.
    await this.settlements.reconcile();
    const owed = await unwrap<OwedRow[]>(this.db.rpc('merchant_payouts_owed', { p_from: from.toISOString() }));

    for (const row of owed) {
      // Owes more in refunds than it has earned since: it waits for next week.
      if (Number(row.pending_cad) <= 0 || resumed.has(row.vendor_id)) continue;

      if (!row.account_id) {
        result.skipped++;
        continue;
      }
      if (!(await this.canReceive(row.account_id, row.vendor_id))) {
        result.skipped++;
        continue;
      }

      let claim: ClaimRow | undefined;
      try {
        [claim] = await unwrap<ClaimRow[]>(
          this.db.rpc('merchant_payout_claim', {
            p_vendor_id: row.vendor_id,
            p_from: from.toISOString(),
            p_trigger: opts.trigger,
            p_actor_id: opts.actorId,
          })
        );
      } catch (error) {
        this.logger.error(`Could not claim the payout of shop ${row.vendor_id}: ${String(error)}`);
        result.failed++;
        continue;
      }
      // Nothing left to pay by the time it was claimed (a refund got in first).
      if (!claim) continue;

      await this.pay(
        { payoutId: claim.payout_id, vendorId: row.vendor_id, accountId: row.account_id, amountCad: Number(claim.amount_cad), batchKey },
        result
      );
    }

    result.totalCad = roundCad(result.totalCad);
    this.logger.log(
      `Shop payouts ${batchKey}: ${result.paid} paid (${result.totalCad} CAD), ${result.skipped} waiting on Stripe, ${result.failed} failed`
    );
    return result;
  }

  /**
   * Steps 2 and 3 for one claimed payout: transfer, then settle.
   *
   * Asks Stripe first whether this payout's transfer already exists — it does
   * when an earlier run got as far as the transfer and not the record. Then it
   * is only the record that is missing, and sending again would pay twice.
   */
  private async pay(
    payout: { payoutId: string; vendorId: string; accountId: string; amountCad: number; batchKey: string },
    result: MerchantPayoutRunResult
  ): Promise<void> {
    const group = `merchant-payout:${payout.payoutId}`;
    let transferId: string | null;
    try {
      transferId =
        (await this.payments.findTransfer(group)) ??
        (await this.payments.transfer({
          accountId: payout.accountId,
          amountCents: toStripeAmount(payout.amountCad),
          idempotencyKey: group,
          transferGroup: group,
          description: `Sougouba — ventes livrées jusqu'au ${payout.batchKey}`,
        }));
    } catch (error) {
      this.logger.error(`Payout ${payout.payoutId} to shop ${payout.vendorId} was refused: ${String(error)}`);
      await this.release(payout.payoutId, errorMessage(error));
      result.failed++;
      return;
    }

    try {
      await unwrap(
        this.db
          .from('merchant_payouts')
          .update({ status: 'paid', stripe_transfer_id: transferId, paid_at: new Date().toISOString() })
          .eq('id', payout.payoutId)
          .eq('status', 'pending')
      );
    } catch (error) {
      // The money has gone and the record has not followed. The payout stays
      // open with its orders claimed, so nothing is paid twice; the next run
      // finds the transfer at Stripe and finishes the record.
      this.logger.error(
        `Shop ${payout.vendorId} was paid by ${transferId} but payout ${payout.payoutId} was not marked paid — the next run will finish it: ${String(error)}`
      );
      result.failed++;
      return;
    }

    result.paid++;
    result.totalCad += payout.amountCad;
  }

  /** Whether Stripe will accept a transfer to this account today. A question Stripe cannot answer counts as no. */
  private async canReceive(accountId: string, vendorId: string): Promise<boolean> {
    try {
      return (await this.payments.getConnectAccount(accountId)).payoutsEnabled;
    } catch (error) {
      this.logger.warn(`Could not read the Stripe account of shop ${vendorId}, so it is not paid this time: ${String(error)}`);
      return false;
    }
  }

  private async release(payoutId: string, reason: string): Promise<void> {
    try {
      await unwrapRpc<boolean>(this.db.rpc('merchant_payout_release', { p_payout_id: payoutId, p_error: reason }));
    } catch (error) {
      this.logger.error(`Payout ${payoutId} failed and could not be released — its orders stay claimed: ${String(error)}`);
    }
  }

  private async accountsOf(vendorIds: string[]): Promise<Map<string, string>> {
    const rows = await unwrap<{ vendor_id: string; stripe_connect_account_id: string | null }[]>(
      this.db.from('merchant_subscriptions').select('vendor_id, stripe_connect_account_id').in('vendor_id', vendorIds)
    );
    return new Map(rows.filter((r) => r.stripe_connect_account_id).map((r) => [r.vendor_id, r.stripe_connect_account_id as string]));
  }
}

function toOwed(row: OwedRow): MerchantOwed {
  return {
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    pendingCad: roundCad(Number(row.pending_cad)),
    orderCount: row.order_count,
    adjustmentsCad: roundCad(Number(row.adjustments_cad)),
    oldestAt: row.oldest_at,
    hasStripeAccount: row.account_id !== null,
  };
}

/** The next payout day (`PAYOUT_WEEKDAY`), as `yyyy-mm-dd` — today, if today is one. */
export function nextPayoutDate(now: Date): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + ((PAYOUT_WEEKDAY - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
