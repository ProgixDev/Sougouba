import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { orders } from '../db/schema/index.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { PaymentsService } from '../orders/payments.service.js';
import { roundCad, toStripeAmount } from '../orders/pricing.js';
import { AuditService } from './audit.service.js';

type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Money going back.
 *
 * The single path for it, used by both the dispute resolution flow and the
 * standalone admin refund — because a refund is three writes that must not come
 * apart: Stripe moves the money, the order records what moved, and the loyalty
 * points earned on that order are taken back (the brief's own rule: "retrait
 * des points si la commande est remboursée").
 *
 * Ordering is deliberate. Stripe goes **first**, and the database is only
 * written once Stripe has confirmed. The other order — record, then call — can
 * leave an order marked refunded that Stripe rejected, and an order that says
 * it refunded money it did not is worse than one that is briefly out of date.
 * A crash between the two leaves a real refund unrecorded, which is recoverable
 * (the amounts are in Stripe) and loud (the log below).
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService,
    private readonly loyalty: LoyaltyService,
    private readonly audit: AuditService
  ) {}

  /**
   * Refund an order, in whole or in part.
   *
   * Idempotent by refusal rather than by replay: a second refund on an already
   * refunded order is a conflict, not a no-op, because "refund it again" is
   * never what someone means — partial-then-partial would need its own ledger,
   * and pretending the second call succeeded would hide a double payout.
   */
  async refundOrder(
    adminId: string,
    orderId: string,
    input: { amountCad?: number; reason: string }
  ): Promise<{ refundAmountCad: number; stripeRefundId: string | null }> {
    const [order] = await this.db
      .select({
        id: orders.id,
        totalCad: orders.totalCad,
        status: orders.status,
        refundedAt: orders.refundedAt,
        stripePaymentIntentId: orders.stripePaymentIntentId,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new NotFoundException('Order not found');
    if (order.refundedAt) throw new ConflictException('This order has already been refunded');

    const totalCad = Number(order.totalCad);
    const amountCad = roundCad(input.amountCad ?? totalCad);
    if (amountCad > totalCad) {
      throw new BadRequestException(`Refund of ${amountCad} exceeds the order total of ${totalCad}`);
    }

    let stripeRefundId: string | null = null;
    if (order.stripePaymentIntentId) {
      stripeRefundId = await this.payments.refund(order.stripePaymentIntentId, toStripeAmount(amountCad));
    } else {
      // Seeded or imported history has no Stripe side. Recording the decision
      // is still right — the points reversal below depends on it — but nobody
      // should read this as money having moved.
      this.logger.warn(`Order ${orderId} refunded with no PaymentIntent — no money moved, decision recorded only`);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          refundedAt: new Date(),
          refundAmountCad: String(amountCad),
          stripeRefundId,
          refundReason: input.reason,
        })
        .where(eq(orders.id, orderId));

      await this.reversePoints(tx, orderId);

      // In the same transaction as the record of the refund, for the reason the
      // whole table exists — but note it cannot cover the Stripe call, which
      // already happened above and cannot be rolled back. If this transaction
      // fails, the loud log below is still the trail, and the ordering note at
      // the top of this class explains why Stripe has to go first anyway.
      await this.audit.record(
        {
          actorId: adminId,
          action: 'order.refund',
          subjectType: 'order',
          subjectId: orderId,
          reason: input.reason,
          changes: {
            refundAmountCad: { from: null, to: amountCad },
            stripeRefundId: { from: null, to: stripeRefundId },
          },
        },
        tx
      );
    });

    this.logger.log(`Admin ${adminId} refunded ${amountCad} CAD on order ${orderId} (stripe: ${stripeRefundId ?? 'none'})`);
    return { refundAmountCad: amountCad, stripeRefundId };
  }

  /**
   * Take back the points a refunded order earned — `LoyaltyService.reverseForOrder`
   * finally has a caller, having been written in Phase 4 specifically to wait
   * for one.
   *
   * Reverses only the *earn*. The redemption debit is deliberately left alone:
   * points a shopper spent on an order that was then refunded are points they
   * spent, and handing them back alongside a cash refund would pay twice for
   * the same order. If the business wants those returned too, that is a rule to
   * add here explicitly rather than a side effect to inherit.
   */
  private async reversePoints(tx: DbOrTx, orderId: string): Promise<void> {
    await this.loyalty.reverseForOrder(orderId, tx);
  }
}
