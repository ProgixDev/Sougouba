import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { courierPayouts, orderDeliveries } from '../db/schema/index.js';
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
    const [row] = await this.db
      .select({
        pendingCad: sql<string>`coalesce(sum(${orderDeliveries.earningsCad}), 0)`,
        runCount: sql<number>`count(*)::int`,
      })
      .from(orderDeliveries)
      .where(
        and(
          eq(orderDeliveries.courierId, courierId),
          sql`${orderDeliveries.deliveredAt} is not null`,
          isNull(orderDeliveries.paidOutAt)
        )
      );
    return { pendingCad: Number(row?.pendingCad ?? 0), runCount: row?.runCount ?? 0 };
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

    const owed = await this.db
      .select({
        courierId: orderDeliveries.courierId,
        pendingCad: sql<string>`sum(${orderDeliveries.earningsCad})`,
        accountId: courierPayouts.stripeConnectAccountId,
      })
      .from(orderDeliveries)
      .leftJoin(courierPayouts, eq(courierPayouts.courierId, orderDeliveries.courierId))
      .where(and(sql`${orderDeliveries.deliveredAt} is not null`, isNull(orderDeliveries.paidOutAt)))
      .groupBy(orderDeliveries.courierId, courierPayouts.stripeConnectAccountId);

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
        await this.db
          .update(orderDeliveries)
          .set({ paidOutAt: now, stripeTransferId: transferId })
          .where(
            and(
              eq(orderDeliveries.courierId, courier.courierId),
              sql`${orderDeliveries.deliveredAt} is not null`,
              isNull(orderDeliveries.paidOutAt)
            )
          );

        await this.db
          .update(courierPayouts)
          .set({ status: 'paid', updatedAt: now })
          .where(eq(courierPayouts.courierId, courier.courierId));

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
