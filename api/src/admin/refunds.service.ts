import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { PaymentsService } from '../orders/payments.service.js';
import { ReceiptsService } from '../orders/receipts/receipts.service.js';
import { roundCad, toStripeAmount } from '../orders/pricing.js';
import { SettlementsService } from '../orders/settlements.service.js';


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

  // No `AuditService` and no `LoyaltyService`: `order_refund` writes its own
  // audit entry and reverses the points inside the transaction that records the
  // refund.
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService,
    private readonly receipts: ReceiptsService,
    private readonly settlements: SettlementsService
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
    const order = await unwrap<{
      id: string;
      totalCad: string;
      status: string;
      refundedAt: string | null;
      stripePaymentIntentId: string | null;
    } | null>(
      this.db
        .from('orders')
        .select('id, totalCad:total_cad, status, refundedAt:refunded_at, stripePaymentIntentId:stripe_payment_intent_id')
        .eq('id', orderId)
        .maybeSingle()
    );
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

    // The stamp, the points reversal and the audit entry, together. Note it
    // cannot cover the Stripe call, which already happened above and cannot be
    // rolled back — the ordering note at the top of this class explains why
    // Stripe has to go first anyway. If this fails, the loud log below is the
    // trail.
    await unwrapRpc<void>(
      this.db.rpc('order_refund', {
        p_admin_id: adminId,
        p_order_id: orderId,
        p_amount_cad: amountCad,
        p_reason: input.reason,
        p_stripe_refund_id: stripeRefundId as string,
        p_changes: {
          refundAmountCad: { from: null, to: amountCad },
          stripeRefundId: { from: null, to: stripeRefundId },
        } as never,
      }),
      (error) => {
        if (error.code === ALREADY_REFUNDED) throw new ConflictException(error.message);
        throw error;
      }
    );

    this.logger.log(`Admin ${adminId} refunded ${amountCad} CAD on order ${orderId} (stripe: ${stripeRefundId ?? 'none'})`);
    // The shop gives back its part of what the shopper got back: off what it
    // is owed for this order, or off its next payment if it was already paid.
    // Only when money actually moved, for the same reason as the email below.
    if (stripeRefundId) await this.settlements.refundRecorded(orderId, amountCad);
    // The shopper is told, with a receipt that now shows the money coming back.
    // Only when money actually moved: a decision recorded on seeded history
    // refunds nobody, and an email saying otherwise would be a lie.
    if (stripeRefundId) await this.receipts.orderRefunded(orderId);
    return { refundAmountCad: amountCad, stripeRefundId };
  }

  // `reversePoints` is gone: `LoyaltyService.reverseForOrder` took the caller's
  // transaction, and there is none to hand across PostgREST. The reversal moved
  // into `order_refund` so the points and the refund record cannot come apart —
  // a refunded order whose points were never taken back is money paid twice.
}

/** `order_refund` raises this when the order was already refunded. */
const ALREADY_REFUNDED = 'SGB08';
