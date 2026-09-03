import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import type { ReportCourierIssueInput } from '../admin/dto/admin.dto.js';
import {
  courierIssues,
  courierLocations,
  couriers,
  deliveryProofs,
  orderDeliveries,
  orders,
  orderStatusHistory,
} from '../db/schema/index.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { assertTransition } from '../orders/order-status.js';
import { courierEarnings, pinMatches } from './courier-pay.js';
import type { CompleteDeliveryInput, LocationPingInput } from './dto/courier.dto.js';

/**
 * The two acts that move an order physically: picking it up, and handing it
 * over. Both belong to the courier carrying it, which is why they are here and
 * not on `PATCH /orders/:id/status` — each also writes a timestamp, a proof, or
 * a payout, and offering a second, evidence-free route to `delivered` would
 * make all of that optional.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly loyalty: LoyaltyService
  ) {}

  /** The run this courier is carrying, or a 404. Every method below starts here. */
  private async ownedRun(courierId: string, orderId: string) {
    const [row] = await this.db
      .select({
        orderId: orderDeliveries.orderId,
        courierId: orderDeliveries.courierId,
        pickedUpAt: orderDeliveries.pickedUpAt,
        deliveredAt: orderDeliveries.deliveredAt,
        distanceKm: orderDeliveries.distanceKm,
        pin: orderDeliveries.pin,
        status: orders.status,
      })
      .from(orderDeliveries)
      .innerJoin(orders, eq(orders.id, orderDeliveries.orderId))
      .where(and(eq(orderDeliveries.orderId, orderId), eq(orderDeliveries.courierId, courierId)))
      .limit(1);
    // A 404 rather than a 403 — an order id you are not carrying should not be
    // confirmed to exist.
    if (!row) throw new NotFoundException('Run not found');
    return row;
  }

  /** What the courier's own screen shows: the run, plus the PIN they will be read at the door. */
  async run(courierId: string, orderId: string) {
    const run = await this.ownedRun(courierId, orderId);
    return run;
  }

  /**
   * The courier has the bag. Paired with the `ready → out_for_delivery`
   * advance, which is checked against the same `STATUS_ACTOR` table the
   * merchant's endpoint uses — so a courier cannot pick up an order the shop
   * has not finished packing.
   */
  async markPickedUp(courierId: string, orderId: string) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.pickedUpAt) throw new ConflictException('This run is already picked up');
    assertTransition(run.status, 'out_for_delivery', 'courier');

    const now = new Date();
    await this.db.transaction(async (tx) => {
      const moved = await tx
        .update(orders)
        .set({ status: 'out_for_delivery' })
        .where(and(eq(orders.id, orderId), eq(orders.status, run.status)))
        .returning({ id: orders.id });
      if (moved.length === 0) throw new ConflictException('The order status changed while you were acting on it');

      await tx.update(orderDeliveries).set({ pickedUpAt: now }).where(eq(orderDeliveries.orderId, orderId));
      await tx.insert(orderStatusHistory).values({ orderId, status: 'out_for_delivery', at: now });
    });

    return this.run(courierId, orderId);
  }

  /**
   * The run is finished, with evidence.
   *
   * Proof and status land in one transaction on purpose: an order marked
   * delivered with no proof is exactly the state a dispute turns on, and
   * letting the two drift apart would make it reachable by closing a screen at
   * the wrong moment. The mock made the same argument and then discarded the
   * evidence anyway — `ProofCapture` admits the drawn signature "is not
   * persisted… there is no backend to upload it to". Here the path is stored.
   *
   * The PIN, when that is the method, is checked against the **stored** value
   * rather than one derived from the order id. That is the whole point of
   * Phase 5's PIN change: a derived PIN proves only that someone knows the
   * order id, which the merchant, the shopper and every URL already do.
   */
  async complete(courierId: string, orderId: string, input: CompleteDeliveryInput) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.deliveredAt) throw new ConflictException('This run is already complete');
    if (!run.pickedUpAt) throw new ConflictException('Mark the order picked up first');
    assertTransition(run.status, 'delivered', 'courier');

    if (input.method === 'pin' && !pinMatches(run.pin, input.pin!)) {
      throw new BadRequestException('NIP incorrect');
    }

    const now = new Date();
    const tipCad = input.tipCad ?? 0;
    // Frozen here, once, from the distance recorded at assignment and the tip
    // as it finally landed. Never re-derived afterwards: recomputing pay from
    // today's rates would rewrite a courier's history the day a rate changes.
    const earningsCad = courierEarnings(Number(run.distanceKm), tipCad);

    await this.db.transaction(async (tx) => {
      const moved = await tx
        .update(orders)
        .set({ status: 'delivered' })
        .where(and(eq(orders.id, orderId), eq(orders.status, run.status)))
        .returning({ id: orders.id });
      if (moved.length === 0) throw new ConflictException('The order status changed while you were acting on it');

      await tx
        .update(orderDeliveries)
        .set({ deliveredAt: now, tipCad: String(tipCad), earningsCad: String(earningsCad) })
        .where(eq(orderDeliveries.orderId, orderId));

      await tx.insert(deliveryProofs).values({
        orderId,
        method: input.method,
        imagePath: input.imagePath ?? null,
        note: input.note ?? null,
        at: now,
      });

      await tx.insert(orderStatusHistory).values({ orderId, status: 'delivered', at: now });

      await tx
        .update(couriers)
        .set({ deliveryCount: sql`${couriers.deliveryCount} + 1` })
        .where(eq(couriers.id, courierId));
    });

    // **The caller Phase 4 was written for.** This is the one place an order
    // actually becomes delivered, and the brief credits points "après livraison
    // réussie" and nowhere earlier. Outside the transaction and deliberately
    // non-fatal: the delivery is a physical fact that has already happened, and
    // a ledger hiccup must not un-deliver it. `creditForDeliveredOrder` is
    // idempotent, so a retry — or Phase 6's backfill — settles it.
    try {
      await this.loyalty.creditForDeliveredOrder(orderId, now);
    } catch (error) {
      this.logger.error(`Order ${orderId} delivered but loyalty credit failed — needs a replay: ${String(error)}`);
    }

    return this.run(courierId, orderId);
  }

  /**
   * The courier flags a problem — nobody at the door, a wrong address, a shop
   * that is not ready.
   *
   * Changes nothing else, deliberately: the run stays open, because a courier
   * standing outside a locked building still has someone's dinner and the order
   * is not resolved until it is somewhere. Port of the mock's
   * `reportCourierIssue`, with the status field the mock's `CourierIssue`
   * never had — nothing there could ever close one.
   *
   * One report per order: reopening would overwrite what the courier first
   * said, which is the part an administrator is reading.
   */
  async reportIssue(courierId: string, orderId: string, input: ReportCourierIssueInput) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.deliveredAt) throw new ConflictException('This run is already complete');

    const inserted = await this.db
      .insert(courierIssues)
      .values({ orderId, reason: input.reason, message: input.message, status: 'open' })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) throw new ConflictException('An issue is already open on this run');

    this.logger.warn(`Courier ${courierId} reported "${input.reason}" on order ${orderId}`);
    return inserted[0];
  }

  /**
   * A GPS ping while carrying an order.
   *
   * Append-only rather than an upsert-in-place: the write volume is one row
   * every few seconds per active run, and keeping the trail makes a disputed
   * delivery answerable ("the courier was two streets away at 19:04") in a way
   * a single overwritten position never could.
   *
   * Only accepted while the run is actually in flight — a courier's app that
   * keeps pinging after delivery, or before pickup, is reporting a position
   * nobody is waiting on.
   */
  async recordLocation(courierId: string, orderId: string, input: LocationPingInput) {
    const run = await this.ownedRun(courierId, orderId);
    if (run.deliveredAt) throw new ConflictException('This run is already complete');

    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(courierLocations).values({
        courierId,
        orderId,
        lat: input.lat,
        lng: input.lng,
        heading: input.heading ?? null,
      });
      // A ping is also a heartbeat — a courier mid-run is plainly on shift, and
      // requiring a separate keep-alive would age them out of the roster while
      // they are literally driving.
      await tx
        .update(couriers)
        .set({ lastSeenAt: now, baseLat: input.lat, baseLng: input.lng })
        .where(eq(couriers.id, courierId));
    });

    return { recordedAt: now };
  }
}
