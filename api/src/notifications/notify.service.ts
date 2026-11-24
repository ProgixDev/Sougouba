import { Inject, Injectable, Logger } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import type { OrderStatus } from '../orders/order-status.js';
import {
  applicationCopy,
  chatCopy,
  courierCopy,
  customerCopy,
  merchantCopy,
  orderReference,
} from './messages.js';
import { PushService } from './push.service.js';

interface OrderContext {
  id: string;
  customerId: string;
  totalCad: number;
  vendor: { name: string; ownerId: string } | null;
  items: { qty: number }[];
}

/**
 * The events the platform pushes about, named the way the business names them.
 *
 * Callers say *what happened* (`orderStatusChanged`, `offerMade`); this decides
 * who hears about it, under which switch, and with what words. Every method
 * looks up what it needs from the order id alone, so a caller never has to
 * thread a vendor name through just to make a notification possible.
 *
 * Like `PushService`, nothing here throws. Callers run these **alongside** the
 * response they are building (`Promise.all`) rather than after it: on a
 * serverless host a promise left running once the response is sent may simply
 * never finish, and awaiting in sequence would add the push's round trips to a
 * merchant's tap.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly push: PushService,
  ) {}

  /** The shopper hears about the steps that change what they should do next. */
  async orderStatusChanged(
    orderId: string,
    status: OrderStatus,
  ): Promise<void> {
    const copy = {
      confirmed: { make: customerCopy.confirmed, category: 'orderUpdates' },
      out_for_delivery: {
        make: customerCopy.outForDelivery,
        category: 'deliveryAlerts',
      },
      delivered: { make: customerCopy.delivered, category: 'orderUpdates' },
      cancelled: { make: customerCopy.cancelled, category: 'orderUpdates' },
    } as const;
    // `preparing` and `ready` are the shop's internal steps; a buzz for each
    // would train the shopper to ignore the ones that matter.
    if (!(status in copy)) return;
    const { make, category } = copy[status as keyof typeof copy];

    await this.guard('orderStatusChanged', async () => {
      const order = await this.order(orderId);
      if (!order) return;
      const params = {
        ref: orderReference(order.id),
        vendor: order.vendor?.name ?? 'Sougouba',
      };
      await this.push.send([order.customerId], {
        content: (l) => make(params, l),
        url: customerOrderUrl(order.id),
        channel: 'orders',
        category,
      });
    });
  }

  /**
   * An order was cancelled. Everyone still involved hears about it — except
   * whoever did it, who is looking at the result already.
   *
   * `courierId` is the courier the cancellation released, when there was one:
   * by the time this runs their delivery row is gone, so the caller is the only
   * one who still knows who that was.
   */
  async orderCancelled(
    orderId: string,
    event: {
      by: 'customer' | 'merchant' | 'admin' | 'system';
      /** The order's `cancel_reason` — what tells the system's two timers apart. */
      reason?: string | null;
      refunded: boolean;
      courierId?: string | null;
    },
  ): Promise<void> {
    await this.guard('orderCancelled', async () => {
      const order = await this.order(orderId);
      if (!order) return;
      const ref = orderReference(order.id);
      const vendor = order.vendor?.name ?? 'Sougouba';
      const sends: Promise<unknown>[] = [];

      if (event.by !== 'customer') {
        const by = event.by;
        sends.push(
          this.push.send([order.customerId], {
            content: (l) => customerCopy.cancelledBy({ ref, vendor, by, reason: event.reason, refunded: event.refunded }, l),
            url: customerOrderUrl(order.id),
            channel: 'orders',
            category: 'orderUpdates',
          }),
        );
      }
      if (event.by !== 'merchant' && order.vendor) {
        const by = event.by;
        sends.push(
          this.push.send([order.vendor.ownerId], {
            content: (l) => merchantCopy.orderCancelled({ ref, by, reason: event.reason }, l),
            url: `/(business)/order/${order.id}`,
            channel: 'orders',
          }),
        );
      }
      if (event.courierId) {
        const courier = await unwrap<{ userId: string } | null>(
          this.db.from('couriers').select('userId:user_id').eq('id', event.courierId).maybeSingle(),
        );
        if (courier) {
          sends.push(
            this.push.send([courier.userId], {
              content: (l) => courierCopy.runCancelled({ ref, vendor }, l),
              url: '/(courier)/(tabs)/missions',
              channel: 'orders',
            }),
          );
        }
      }
      await Promise.all(sends);
    });
  }

  /**
   * The shop has not answered an order yet: one reminder, before the order is
   * cancelled for lack of an answer. `minutesLeft` is how long it still has.
   */
  async orderWaitingForShop(orderId: string, minutesLeft: number | null): Promise<void> {
    await this.guard('orderWaitingForShop', async () => {
      const order = await this.order(orderId);
      if (!order?.vendor) return;
      const ref = orderReference(order.id);
      await this.push.send([order.vendor.ownerId], {
        content: (l) => merchantCopy.orderWaiting({ ref, minutesLeft }, l),
        url: `/(business)/order/${order.id}`,
        channel: 'orders',
      });
    });
  }

  /** A paid order has just landed in the shop's queue. */
  async orderPlaced(orderId: string): Promise<void> {
    await this.guard('orderPlaced', async () => {
      const order = await this.order(orderId);
      if (!order?.vendor) return;
      const params = {
        ref: orderReference(order.id),
        items: order.items.reduce((sum, line) => sum + line.qty, 0),
        totalCad: order.totalCad,
      };
      await this.push.send([order.vendor.ownerId], {
        content: (l) => merchantCopy.newOrder(params, l),
        url: `/(business)/order/${order.id}`,
        channel: 'orders',
      });
    });
  }

  /**
   * The monthly subscription could not be charged. Stripe emails the merchant
   * too, and retries on its own; this is the nudge that reaches a phone.
   */
  async subscriptionPaymentFailed(vendorId: string): Promise<void> {
    await this.guard('subscriptionPaymentFailed', async () => {
      const vendor = await unwrap<{ ownerId: string } | null>(
        this.db.from('vendors').select('ownerId:owner_id').eq('id', vendorId).maybeSingle(),
      );
      if (!vendor) return;
      await this.push.send([vendor.ownerId], {
        content: (l) => merchantCopy.subscriptionPaymentFailed({}, l),
        url: '/(business)/(tabs)/profile',
        channel: 'orders',
      });
    });
  }

  /** The shopper opened a dispute: the merchant is asked to answer it. */
  async disputeOpened(orderId: string): Promise<void> {
    await this.guard('disputeOpened', async () => {
      const order = await this.order(orderId);
      if (!order?.vendor) return;
      const ref = orderReference(order.id);
      await this.push.send([order.vendor.ownerId], {
        content: (l) => merchantCopy.disputeOpened({ ref }, l),
        url: `/(business)/order/${order.id}`,
        channel: 'orders',
      });
    });
  }

  /** The back office settled the shopper's dispute. */
  async disputeResolved(orderId: string): Promise<void> {
    await this.guard('disputeResolved', async () => {
      const order = await this.order(orderId);
      if (!order) return;
      const ref = orderReference(order.id);
      await this.push.send([order.customerId], {
        content: (l) => customerCopy.disputeResolved({ ref }, l),
        url: customerOrderUrl(order.id),
        channel: 'orders',
        category: 'orderUpdates',
      });
    });
  }

  /**
   * A team member answered the customer's escalated support conversation.
   * No category: it is the answer to something they asked for, not a
   * notification type they could have switched off.
   */
  async supportReplied(customerId: string): Promise<void> {
    await this.guard('supportReplied', async () => {
      await this.push.send([customerId], {
        content: (l) => customerCopy.supportReplied({}, l),
        url: '/(customer)/account/support',
        channel: 'orders',
      });
    });
  }

  /**
   * A chat message about an order, for the other side. No category for the
   * shopper: it is someone at their door asking something, not a notification
   * type to switch off. The courier's taps open the run's chat, the shopper's
   * open theirs.
   */
  async orderMessage(message: {
    orderId: string;
    to: 'customer' | 'courier';
    recipient: string;
    senderName: string;
    body: string;
  }): Promise<void> {
    await this.guard('orderMessage', async () => {
      const params = { name: message.senderName, text: message.body };
      await this.push.send([message.recipient], {
        content: (l) => chatCopy.newMessage(params, l),
        url: message.to === 'customer' ? `/(customer)/chat/${message.orderId}` : `/(courier)/chat/${message.orderId}`,
        channel: 'orders',
      });
    });
  }

  /**
   * The back office approved a shop or a courier. Only approvals are pushed:
   * a refusal or a suspension deserves a reason a lock screen cannot carry.
   */
  async applicationApproved(
    kind: 'vendor' | 'courier',
    id: string,
  ): Promise<void> {
    await this.guard('applicationApproved', async () => {
      if (kind === 'vendor') {
        const vendor = await unwrap<{ name: string; ownerId: string } | null>(
          this.db
            .from('vendors')
            .select('name, ownerId:owner_id')
            .eq('id', id)
            .maybeSingle(),
        );
        if (!vendor) return;
        await this.push.send([vendor.ownerId], {
          content: (l) =>
            applicationCopy.vendorApproved({ name: vendor.name }, l),
          url: '/(business)/(tabs)/dashboard',
          channel: 'orders',
        });
        return;
      }
      const courier = await unwrap<{ userId: string } | null>(
        this.db
          .from('couriers')
          .select('userId:user_id')
          .eq('id', id)
          .maybeSingle(),
      );
      if (!courier) return;
      await this.push.send([courier.userId], {
        content: (l) => applicationCopy.courierApproved({}, l),
        url: '/(courier)/(tabs)/missions',
        channel: 'orders',
      });
    });
  }

  /**
   * A courier was offered a run. The offer lapses in seconds, so this is the
   * one push sent at the highest urgency the channel allows (see the app's
   * `offers` channel).
   */
  async offerMade(offer: {
    courierId: string;
    vendorId: string;
    distanceToPickupKm: number;
    earningsCad: number;
  }) {
    await this.guard('offerMade', async () => {
      const [courier, vendor] = await Promise.all([
        unwrap<{ userId: string } | null>(
          this.db
            .from('couriers')
            .select('userId:user_id')
            .eq('id', offer.courierId)
            .maybeSingle(),
        ),
        unwrap<{ name: string } | null>(
          this.db
            .from('vendors')
            .select('name')
            .eq('id', offer.vendorId)
            .maybeSingle(),
        ),
      ]);
      if (!courier) return;
      const params = {
        vendor: vendor?.name ?? 'Sougouba',
        km: offer.distanceToPickupKm,
        earningsCad: offer.earningsCad,
      };
      await this.push.send([courier.userId], {
        content: (l) => courierCopy.newOffer(params, l),
        url: '/(courier)/(tabs)/missions',
        channel: 'offers',
      });
    });
  }

  // ──────────────────────────────────────────────────────────────────────────

  private async order(orderId: string): Promise<OrderContext | null> {
    const row = await unwrap<{
      id: string;
      customerId: string;
      totalCad: string | number;
      vendor: { name: string; ownerId: string } | null;
      items: { qty: number }[];
    } | null>(
      this.db
        .from('orders')
        .select(
          'id, customerId:customer_id, totalCad:total_cad, vendor:vendors(name, ownerId:owner_id), items:order_items(qty)',
        )
        .eq('id', orderId)
        .maybeSingle(),
    );
    return row ? { ...row, totalCad: Number(row.totalCad) } : null;
  }

  /** A notification is never worth failing the caller over. */
  private async guard(event: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn(`Push for ${event} skipped: ${String(error)}`);
    }
  }
}

function customerOrderUrl(orderId: string): string {
  return `/(customer)/order/${orderId}`;
}
