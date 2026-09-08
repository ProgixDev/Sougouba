import { Inject, Injectable, Logger } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import { PaymentsService } from '../orders/payments.service.js';
import { toStripeAmount } from '../orders/pricing.js';

/** Friday, matching `PAYOUT_WEEKDAY` in the mobile app's `lib/courierAnalytics.ts`. */
export const PAYOUT_WEEKDAY = 5;

/**
 * Paying couriers — the thing the mock had **no equivalent of at all**.
 *
 * `pendingPayoutCad` and `nextPayoutDate` in `lib/courierAnalytics.ts` are a
 * read-only projection over `earningsCad`: they tell a courier what they are
 * owed and when it should arrive, and nothing anywhere ever moved a cent. This
 * is the code that does.
 *
 * The money leaves as a Stripe **Transfer** to the courier's Connect account,
 * which then pays out to their bank on Stripe's schedule. Doing it the other
 * way round — the platform disbursing to bank accounts itself — is what the
 * plan spends Phase 5 and 7 refusing, because it means holding bank details.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService
  ) {}

  /**
   * What a courier is owed but has not been paid.
   *
   * "Not been paid" is `paid_out_at is null` on the delivery row, not a date
   * range: a run missed by a failed batch has to appear in the next one, and
   * anything keyed on "since last Friday" would silently drop it forever.
   */
  async pendingFor(courierId: string) {
    // Summed here rather than in SQL: this is one courier's unpaid runs, a
    // handful of rows, and PostgREST has no `sum()`. The `paid_out_at is null`
    // predicate is the one that matters and it is still the database's.
    const rows = await unwrap<{ earningsCad: string }[]>(
      this.db
        .from('order_deliveries')
        .select('earningsCad:earnings_cad')
        .eq('courier_id', courierId)
        .not('delivered_at', 'is', null)
        .is('paid_out_at', null)
    );
    return {
      pendingCad: rows.reduce((sum, r) => sum + Number(r.earningsCad), 0),
      runCount: rows.length,
    };
  }

  /**
   * Pay every courier with completed, unpaid runs.
   *
   * Per courier, not one big transfer: each has their own Connect account, and
   * one courier's missing onboarding must not stop everyone else being paid —
   * which is why each is wrapped individually and a failure is logged and
   * skipped rather than thrown.
   *
   * The idempotency key is the courier plus the batch date, so a retried batch
   * on the same day cannot pay twice even if the marking step failed after the
   * transfer succeeded. That ordering is deliberate: transfer first, then mark.
   * The reverse can mark runs paid that Stripe rejected, and an unpaid courier
   * whose runs read as settled has no way to notice.
   */
  async runBatch(now: Date = new Date()): Promise<{ paid: number; skipped: number; totalCad: number }> {
    const batchKey = now.toISOString().slice(0, 10);

    const rows = await unwrap<{ courier_id: string; pending_cad: string; account_id: string | null }[]>(
      this.db.rpc('payouts_owed')
    );
    const owed = rows.map((r) => ({
      courierId: r.courier_id,
      pendingCad: r.pending_cad,
      accountId: r.account_id,
    }));

    let paid = 0;
    let skipped = 0;
    let totalCad = 0;

    for (const courier of owed) {
      const amountCad = Number(courier.pendingCad);
      if (amountCad <= 0) continue;

      if (!courier.accountId) {
        // Not an error, and deliberately not fatal: a courier who has not
        // finished Connect onboarding keeps accruing and is paid by the first
        // batch after they do. The log is what makes it visible.
        this.logger.warn(
          `Courier ${courier.courierId} is owed ${amountCad} CAD but has no Connect account — skipped, will roll into the next batch`
        );
        skipped++;
        continue;
      }

      try {
        const transferId = await this.payments.transfer({
          accountId: courier.accountId,
          amountCents: toStripeAmount(amountCad),
          idempotencyKey: `payout:${courier.courierId}:${batchKey}`,
          description: `Sougouba — courses jusqu'au ${batchKey}`,
        });

        // Only now. A crash between the transfer and this leaves runs unpaid in
        // the database and paid at Stripe, which the idempotency key makes safe
        // to re-run: the second attempt returns the same transfer without
        // moving money again.
        // The same `paid_out_at is null` predicate, so a run that somehow got
        // settled between the roll-up and here is not re-stamped.
        await unwrap(
          this.db
            .from('order_deliveries')
            .update({ paid_out_at: now.toISOString(), stripe_transfer_id: transferId })
            .eq('courier_id', courier.courierId)
            .not('delivered_at', 'is', null)
            .is('paid_out_at', null)
        );

        await unwrap(
          this.db
            .from('courier_payouts')
            .update({ status: 'paid', updated_at: now.toISOString() })
            .eq('courier_id', courier.courierId)
        );

        paid++;
        totalCad += amountCad;
      } catch (error) {
        this.logger.error(`Payout to courier ${courier.courierId} failed: ${String(error)}`);
        skipped++;
      }
    }

    this.logger.log(`Payout batch ${batchKey}: ${paid} paid (${totalCad} CAD), ${skipped} skipped`);
    return { paid, skipped, totalCad };
  }
}
