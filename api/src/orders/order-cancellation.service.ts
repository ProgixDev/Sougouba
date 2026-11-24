import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { NotifyService } from '../notifications/notify.service.js';
import { canCancelAs, SYSTEM_CANCEL_FROM, type CancelActor, type OrderStatus, type SystemCancelReason } from './order-status.js';
import { PaymentsService } from './payments.service.js';
import { toStripeAmount } from './pricing.js';
import { ReceiptsService } from './receipts/receipts.service.js';

/** What a cancellation did, for whoever asked for it. */
export interface CancellationOutcome {
  /**
   * `refunded` — the money is on its way back. `not_needed` — there was none to
   * send (seeded history, or staff had already refunded it). `failed` — the
   * order is cancelled and Stripe refused or could not be reached: it needs a
   * person, and the log says so loudly.
   */
  refund: 'refunded' | 'not_needed' | 'failed';
  refundAmountCad: number | null;
  /** The courier the cancellation released, when one was carrying or heading to the order. */
  courierId: string | null;
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  customerId: string;
  vendorId: string;
  totalCad: string;
  refundedAt: string | null;
  stripePaymentIntentId: string | null;
  merchantPaidCad: string | null;
}

const ORDER_COLUMNS =
  'id, status, customerId:customer_id, vendorId:vendor_id, totalCad:total_cad, refundedAt:refunded_at, ' +
  'stripePaymentIntentId:stripe_payment_intent_id, merchantPaidCad:merchant_paid_cad';

/**
 * Ending an order early — by the shopper, the shop, the back office, or the
 * timer that gives up on finding a courier.
 *
 * One path for all four, because a cancellation is the same three things
 * whoever asks: the order stops (and what placing it took comes back — stock,
 * points, coupon — in `order_cancel`), the money goes back, and everyone still
 * waiting on it is told.
 *
 * **Cancel first, refund second.** The other order is the dangerous one: a
 * refund sent for an order the shop confirmed in the same second would leave a
 * free meal on its way. So the status change is a compare-and-swap in the
 * database, and Stripe is only called once it has landed. The price is the
 * opposite failure — cancelled, refund not sent — which is recoverable (the
 * back office refund button works on a cancelled order) and loud (the log
 * line below), where the first is neither.
 */
@Injectable()
export class OrderCancellationService {
  private readonly logger = new Logger(OrderCancellationService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService,
    private readonly receipts: ReceiptsService,
    private readonly notify: NotifyService
  ) {}

  /** The shopper, on their own order, while the shop has not answered. */
  async byCustomer(customerId: string, orderId: string, input: { reason: string; note?: string }): Promise<CancellationOutcome> {
    const order = await this.find(orderId, { column: 'customer_id', value: customerId });
    if (!canCancelAs(order.status, 'customer')) {
      // In French and in the customer's words: this is the one refusal a
      // shopper reads, and they read it on the button they just pressed.
      throw new ForbiddenException(
        order.status === 'cancelled'
          ? 'Cette commande est déjà annulée.'
          : 'La boutique a déjà accepté cette commande : elle ne peut plus être annulée ici. Contactez l’assistance.'
      );
    }
    return this.cancel(order, { by: 'customer', byId: customerId, reason: input.reason, note: input.note ?? null });
  }

  /** The shop, on one of its own orders, while it still holds the bag. The caller has checked the transition. */
  async byMerchant(ownerId: string, vendorId: string, orderId: string): Promise<CancellationOutcome> {
    const order = await this.find(orderId, { column: 'vendor_id', value: vendorId });
    if (!canCancelAs(order.status, 'merchant')) {
      throw new ForbiddenException(`An order that is "${order.status}" can no longer be cancelled here`);
    }
    return this.cancel(order, { by: 'merchant', byId: ownerId, reason: null, note: null });
  }

  /** The back office, on any order not yet delivered. Audited as `order.cancel`. */
  async byAdmin(adminId: string, orderId: string, reason: string): Promise<CancellationOutcome> {
    const order = await this.find(orderId);
    if (!canCancelAs(order.status, 'admin')) {
      throw new ConflictException(
        order.status === 'cancelled'
          ? 'This order is already cancelled'
          : 'A delivered order cannot be cancelled — refund it instead'
      );
    }
    return this.cancel(order, { by: 'admin', byId: adminId, reason: null, note: reason });
  }

  /**
   * A timer giving up: on a shop that never answered, or on finding a courier
   * for a packed order. Never throws — it runs from a sweep over several
   * orders, and one that moved under it (the shop accepted, a courier took it,
   * a second ago) must not stop the others. Null when there was nothing to do.
   */
  async bySystem(orderId: string, reason: SystemCancelReason): Promise<CancellationOutcome | null> {
    try {
      const order = await this.find(orderId);
      // Each timer only from its own status: see `SYSTEM_CANCEL_FROM`.
      if (order.status !== SYSTEM_CANCEL_FROM[reason]) return null;
      return await this.cancel(order, { by: 'system', byId: null, reason, note: null });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) return null;
      this.logger.error(`Automatic cancellation of order ${orderId} failed: ${String(error)}`);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  private async find(orderId: string, owner?: { column: 'customer_id' | 'vendor_id'; value: string }): Promise<OrderRow> {
    let query = this.db.from('orders').select(ORDER_COLUMNS).eq('id', orderId);
    // Scoped in the query, so somebody else's order id answers exactly like one that does not exist.
    if (owner) query = query.eq(owner.column, owner.value);
    const order = await unwrap<OrderRow | null>(query.maybeSingle() as never);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async cancel(
    order: OrderRow,
    actor: { by: CancelActor; byId: string | null; reason: string | null; note: string | null }
  ): Promise<CancellationOutcome> {
    const moved = (error: PostgrestError): never => {
      if (error.code === STATUS_MOVED) {
        throw new ConflictException('Cette commande vient de changer d’état. Rechargez-la avant de réessayer.');
      }
      throw unexpectedDbError(error);
    };

    // The cancellation, and everything placing the order took, in one
    // transaction. `p_from` makes it a compare-and-swap: if the order moved
    // since `find` read it, nothing is written and nothing below runs.
    const result =
      actor.by === 'admin'
        ? await unwrapRpc<{ courierId: string | null }>(
            this.db.rpc('admin_order_cancel', {
              p_admin_id: actor.byId as string,
              p_order_id: order.id,
              p_from: order.status,
              p_reason: actor.note as string,
            }),
            moved
          )
        : await unwrapRpc<{ courierId: string | null }>(
            this.db.rpc('order_cancel', {
              p_order_id: order.id,
              p_from: order.status,
              p_by: actor.by,
              p_by_id: actor.byId as string,
              p_reason: actor.reason as string,
              p_note: actor.note as string,
            }),
            moved
          );

    const courierId = result?.courierId ?? null;
    const refund = await this.refund(order, actor.by, actor.reason);

    this.logger.log(
      `Order ${order.id} cancelled by ${actor.by}${actor.byId ? ` ${actor.byId}` : ''} from "${order.status}" — refund: ${refund.refund}`
    );

    // Alongside each other, and neither can fail the cancellation: it has
    // already happened. The receipt email is the one that shows the money
    // coming back, so it only goes out when money actually moved.
    await Promise.all([
      this.notify.orderCancelled(order.id, {
        by: actor.by,
        reason: actor.reason,
        refunded: refund.refund === 'refunded',
        courierId,
      }),
      refund.refund === 'refunded' ? this.receipts.orderRefunded(order.id) : Promise.resolve(),
    ]);

    return { ...refund, courierId };
  }

  /**
   * Send the payment back, whole, and record it. Never throws: by now the
   * order is cancelled, and a refund that failed is reported, not raised —
   * raising would tell the shopper their cancellation failed when it did not.
   */
  private async refund(
    order: OrderRow,
    by: CancelActor,
    reason: string | null
  ): Promise<Pick<CancellationOutcome, 'refund' | 'refundAmountCad'>> {
    // No payment (seeded history), or staff refunded it before cancelling.
    if (!order.stripePaymentIntentId || order.refundedAt) return { refund: 'not_needed', refundAmountCad: null };

    const totalCad = Number(order.totalCad);
    let stripeRefundId: string;
    try {
      stripeRefundId = await this.payments.refundCancelledOrder(order.stripePaymentIntentId, toStripeAmount(totalCad), {
        orderId: order.id,
        // Only a payment Stripe actually split with the shop has a transfer to pull back.
        unwind: Number(order.merchantPaidCad ?? 0) > 0,
      });
    } catch (error) {
      this.logger.error(
        `Order ${order.id} is CANCELLED but its refund of ${totalCad} CAD FAILED (${order.stripePaymentIntentId}): ${String(error)}. ` +
          'REFUND IT FROM THE BACK OFFICE.'
      );
      return { refund: 'failed', refundAmountCad: null };
    }

    try {
      await unwrapRpc<boolean>(
        this.db.rpc('order_cancel_refunded', {
          p_order_id: order.id,
          p_amount_cad: totalCad,
          p_stripe_refund_id: stripeRefundId,
          p_reason: by === 'system' && reason === 'shop_no_response' ? SHOP_NO_RESPONSE_REFUND : REFUND_REASON[by],
        })
      );
    } catch (error) {
      // The money moved; only our record of it did not. Stripe has the refund
      // and the idempotency key stops a retry sending it twice.
      this.logger.error(`Order ${order.id} refunded (${stripeRefundId}) but the refund was NOT RECORDED: ${String(error)}`);
    }
    return { refund: 'refunded', refundAmountCad: totalCad };
  }
}

/** What the order's `refund_reason` says, in the language the back office reads. */
const REFUND_REASON: Record<CancelActor, string> = {
  customer: 'Commande annulée par le client',
  merchant: 'Commande annulée par la boutique',
  admin: 'Commande annulée par Sougouba',
  system: 'Commande annulée : aucun livreur disponible',
};

const SHOP_NO_RESPONSE_REFUND = 'Commande annulée : la boutique n’a pas répondu';

/** `order_cancel` raises this when the order left the status the caller read. */
const STATUS_MOVED = 'SGB04';

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
