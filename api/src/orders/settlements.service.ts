import { Inject, Injectable, Logger } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { SettingsService } from '../loyalty/settings.service.js';
import { refundShareOf, splitOrder, type OrderMoney } from './split.js';

interface MissingSettlementRow {
  id: string;
  vendor_id: string;
  subtotal_cad: string | number;
  gst_cad: string | number;
  qst_cad: string | number;
  delivery_fee_cad: string | number;
  total_cad: string | number;
  coupon_discount_cad: string | number | null;
  points_discount_cad: string | number | null;
  commission_cad: string | number | null;
  refund_amount_cad: string | number | null;
  refunded_at: string | null;
  status: string;
}

/** How many orders one pass fills in, and how many passes one call makes — ten thousand orders at most. */
const PAGE = 500;
const MAX_PASSES = 20;

/**
 * The shop's side of each order, as stored — `order_settlements`
 * (`drizzle/0059_merchant_payouts.sql`).
 *
 * Three moments write to it: an order is placed (its share is fixed), an order
 * is refunded after delivery (the shop's part comes off), and the payout run
 * claims it (in SQL, not here). This class is the first two, and the one place
 * that turns an order's figures into a share — always through `splitOrder`, so
 * the rule is never restated.
 *
 * It lives with the orders rather than with the payouts because both the order
 * code and the back office's refunds write through it, and neither may depend
 * on billing.
 */
@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService
  ) {}

  /**
   * Fix the shop's share of an order that has just been placed.
   *
   * Never throws: the order is paid and written by now, and it must not fail
   * over this. A miss is made good by `reconcile`, which every payout run and
   * every balance read passes through first.
   */
  async record(order: { id: string; vendorId: string } & OrderMoney, commissionCad: number): Promise<void> {
    try {
      const { merchantShareCad } = splitOrder(order, { commissionCad });
      const { error } = await this.db
        .from('order_settlements')
        .upsert({ order_id: order.id, vendor_id: order.vendorId, share_cad: merchantShareCad }, { onConflict: 'order_id', ignoreDuplicates: true });
      if (error) this.logger.warn(`Share of order ${order.id} not recorded yet: ${error.message}`);
    } catch (error) {
      this.logger.warn(`Share of order ${order.id} not recorded yet: ${String(error)}`);
    }
  }

  /**
   * Give every paid order that has no settlement its share. Returns how many
   * were written.
   *
   * What makes `record` safe to be best-effort — and what brings in orders
   * placed before settlements existed.
   */
  async reconcile(): Promise<number> {
    let written = 0;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const orders = await unwrap<MissingSettlementRow[]>(this.db.rpc('orders_missing_settlement', { p_limit: PAGE }));
      if (orders.length === 0) break;

      const { commissionRate } = await this.settings.all();
      const rows = orders.map((order) => {
        const money: OrderMoney = {
          subtotalCad: Number(order.subtotal_cad),
          gstCad: Number(order.gst_cad),
          qstCad: Number(order.qst_cad),
          deliveryFeeCad: Number(order.delivery_fee_cad),
          totalCad: Number(order.total_cad),
          couponDiscountCad: order.coupon_discount_cad === null ? null : Number(order.coupon_discount_cad),
        };
        // The commission fixed when the order was placed, when there is one: a
        // rate changed since must not rewrite what a past order owed.
        const { merchantShareCad } = splitOrder(
          money,
          order.commission_cad === null ? { rate: commissionRate } : { commissionCad: Number(order.commission_cad) }
        );
        // An order refunded before it ever had a settlement carries the shop's
        // part of that refund from the start. A refund recorded without its
        // amount is the whole order, as on a statement.
        const refundCad =
          order.refunded_at && order.status === 'delivered'
            ? refundShareOf(
                { totalCad: money.totalCad, merchantShareCad },
                order.refund_amount_cad === null ? money.totalCad : Number(order.refund_amount_cad)
              )
            : 0;
        return { order_id: order.id, vendor_id: order.vendor_id, share_cad: merchantShareCad, refund_cad: refundCad };
      });

      await unwrap(this.db.from('order_settlements').upsert(rows, { onConflict: 'order_id', ignoreDuplicates: true }));
      written += rows.length;
      if (orders.length < PAGE) break;
    }
    if (written > 0) this.logger.log(`Recorded the shop's share on ${written} order(s) that had none`);
    return written;
  }

  /**
   * A refund was given on an order: take the shop's part of it off what the
   * shop is owed (`refundShareOf`). Before the order is paid out it lowers the
   * order's worth; after, it comes off the shop's next payment — the database
   * decides which, under the same lock as a payout claim.
   *
   * Never throws: the shopper has their money back by now and the refund is on
   * record. A miss here means a shop overpaid by this amount, so it is logged
   * as loudly as the code can.
   */
  async refundRecorded(orderId: string, refundCad: number): Promise<void> {
    try {
      const row = await unwrap<{ share_cad: string | number; order: { total_cad: string | number } | null } | null>(
        this.db.from('order_settlements').select('share_cad, order:orders(total_cad)').eq('order_id', orderId).maybeSingle()
      );
      // An order no card paid for has no settlement, and nothing to take back.
      if (!row?.order) return;

      const share = refundShareOf({ totalCad: Number(row.order.total_cad), merchantShareCad: Number(row.share_cad) }, refundCad);
      if (share <= 0) return;
      const outcome = await unwrapRpc<string>(this.db.rpc('order_settlement_refund', { p_order_id: orderId, p_refund_share: share }));
      this.logger.log(`Refund of ${refundCad} CAD on order ${orderId}: ${share} CAD is the shop's part (${outcome})`);
    } catch (error) {
      this.logger.error(
        `REFUND ON ORDER ${orderId} (${refundCad} CAD) WAS NOT TAKEN OFF THE SHOP'S BALANCE — the shop will be overpaid unless it is corrected by hand: ${String(error)}`
      );
    }
  }
}
