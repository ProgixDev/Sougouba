import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { couriers, dispatchOffers, orderDeliveries, orders, vendors } from '../db/schema/index.js';
import { courierEarnings, generateDeliveryPin, legDurationMin, type VehicleType } from './courier-pay.js';
import { HEARTBEAT_TTL_MS, MAX_PICKUP_DISTANCE_KM, offerExpiryFrom } from './dispatch-rules.js';

/**
 * Great-circle distance in SQL, in kilometres.
 *
 * The same haversine `data/utils/geo.ts` computes in TypeScript, expressed once
 * here so the ranking can happen in the database. Ranking in Node would mean
 * pulling every online courier into memory on every dispatch tick to sort them
 * — a full scan of the roster every few seconds to pick one row.
 *
 * `earth_distance`/`cube` would be faster still, but both are extensions this
 * project does not have installed, and adding one to sort a few hundred rows
 * would be buying an index before there is a number to justify it.
 */
function distanceKmSql(aLat: unknown, aLng: unknown, bLat: unknown, bLng: unknown) {
  return sql<number>`(
    6371 * 2 * asin(sqrt(
      power(sin(radians(${bLat} - ${aLat}) / 2), 2)
      + cos(radians(${aLat})) * cos(radians(${bLat})) * power(sin(radians(${bLng} - ${aLng}) / 2), 2)
    ))
  )`;
}

/**
 * The dispatcher, server-side.
 *
 * Replaces `hooks/useDispatchEngine.ts` and `store/useDispatchStore.ts`
 * entirely. The mock ran this loop on the courier's own phone, which made every
 * guarantee advisory: a backgrounded app was invisible to the dispatcher, and a
 * courier could dodge an offer expiry simply by being offline when it lapsed.
 * Here the loop runs whether or not anybody's phone is awake, and expiry is a
 * row the server writes.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * One tick: lapse what has run out, then offer what is waiting.
   *
   * Expiry runs first so a courier who just let an offer lapse is excluded from
   * this tick's ranking rather than being re-offered the same run instantly.
   */
  async tick(): Promise<{ expired: number; offered: number }> {
    const expired = await this.expireLapsedOffers();
    const offered = await this.offerWaitingOrders();
    return { expired, offered };
  }

  /**
   * Mark every pending offer past its deadline as `expired`.
   *
   * This is the rule the mock could not enforce: its timeout lived in a
   * `setTimeout` on the courier's device, so an offer on a killed app simply
   * stayed pending forever and the order stalled.
   */
  private async expireLapsedOffers(): Promise<number> {
    const rows = await this.db
      .update(dispatchOffers)
      .set({ outcome: 'expired' })
      .where(and(isNull(dispatchOffers.outcome), sql`${dispatchOffers.expiresAt} <= now()`))
      .returning({ id: dispatchOffers.id });
    if (rows.length > 0) this.logger.log(`Expired ${rows.length} dispatch offer(s)`);
    return rows.length;
  }

  /**
   * Offer every order that is packed and has nobody carrying it.
   *
   * "Waiting" is `ready` with no `order_deliveries` row and no *live* offer
   * outstanding. An order still `preparing` is deliberately not offerable — a
   * courier who arrives before the food does is a courier standing in a
   * kitchen.
   */
  private async offerWaitingOrders(): Promise<number> {
    const waiting = await this.db
      .select({
        orderId: orders.id,
        vendorId: orders.vendorId,
        pickupLat: vendors.addressLat,
        pickupLng: vendors.addressLng,
        dropoffLat: orders.deliveryAddressLat,
        dropoffLng: orders.deliveryAddressLng,
      })
      .from(orders)
      .innerJoin(vendors, eq(vendors.id, orders.vendorId))
      .where(
        and(
          eq(orders.status, 'ready'),
          sql`not exists (select 1 from ${orderDeliveries} d where d.order_id = ${orders.id})`,
          sql`not exists (
            select 1 from ${dispatchOffers} o
            where o.order_id = ${orders.id} and o.outcome is null
          )`
        )
      )
      // Oldest first: an order that has been waiting longest is the one whose
      // shopper has been waiting longest.
      .orderBy(asc(orders.createdAt))
      .limit(50);

    let offered = 0;
    for (const order of waiting) {
      if (await this.offerNextCourier(order)) offered++;
    }
    return offered;
  }

  /**
   * Hand one order to the nearest eligible courier who has not already seen it.
   *
   * Eligible is: approved, on shift, recently heard from, not already carrying
   * something, and within `MAX_PICKUP_DISTANCE_KM` of the shop. Ranked by
   * distance from the **shop**, not the shopper — the first thing that has to
   * happen is someone reaching the counter.
   */
  private async offerNextCourier(order: {
    orderId: string;
    vendorId: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
  }): Promise<boolean> {
    const staleBefore = new Date(Date.now() - HEARTBEAT_TTL_MS);
    const toPickup = distanceKmSql(couriers.baseLat, couriers.baseLng, order.pickupLat, order.pickupLng);

    const [candidate] = await this.db
      .select({ id: couriers.id, vehicle: couriers.vehicle, distanceToPickupKm: toPickup })
      .from(couriers)
      .where(
        and(
          eq(couriers.status, 'approved'),
          eq(couriers.isOnline, true),
          sql`${couriers.lastSeenAt} is not null and ${couriers.lastSeenAt} >= ${staleBefore}`,
          // Never already offered this order — the server-side form of the
          // mock's `passedOrderIds`. Covers declined and expired alike.
          sql`not exists (
            select 1 from ${dispatchOffers} o
            where o.order_id = ${order.orderId} and o.courier_id = ${couriers.id}
          )`,
          // One run at a time. A courier mid-delivery arriving at a second
          // pickup is how food gets cold in a bag.
          sql`not exists (
            select 1 from ${orderDeliveries} d
            where d.courier_id = ${couriers.id} and d.delivered_at is null
          )`,
          sql`${toPickup} <= ${MAX_PICKUP_DISTANCE_KM}`
        )
      )
      .orderBy(asc(toPickup))
      .limit(1);

    if (!candidate) {
      // Not an error: every nearby courier may have passed, or none may be on
      // shift. The order waits for the next tick. Phase 10's alerting is where
      // "waiting too long" becomes someone's problem.
      return false;
    }

    const toDropoff = haversine(order.pickupLat, order.pickupLng, order.dropoffLat, order.dropoffLng);

    await this.db
      .insert(dispatchOffers)
      .values({
        orderId: order.orderId,
        courierId: candidate.id,
        vendorId: order.vendorId,
        expiresAt: offerExpiryFrom(),
        distanceToPickupKm: String(round2(Number(candidate.distanceToPickupKm))),
        distanceToDropoffKm: String(round2(toDropoff)),
        // The tip is unknown at offer time and is not promised here. Quoting a
        // number that later shrinks is worse than quoting the floor.
        estimatedEarningsCad: String(courierEarnings(toDropoff)),
      })
      // Two ticks overlapping would otherwise both offer the same pair. The
      // unique index makes the second a no-op rather than a duplicate.
      .onConflictDoNothing();

    return true;
  }

  /** A courier's own live offer, if they have one. */
  async pendingOffersFor(courierId: string) {
    const rows = await this.db
      .select({
        id: dispatchOffers.id,
        orderId: dispatchOffers.orderId,
        vendorId: dispatchOffers.vendorId,
        vendorName: vendors.name,
        offeredAt: dispatchOffers.offeredAt,
        expiresAt: dispatchOffers.expiresAt,
        distanceToPickupKm: dispatchOffers.distanceToPickupKm,
        distanceToDropoffKm: dispatchOffers.distanceToDropoffKm,
        estimatedEarningsCad: dispatchOffers.estimatedEarningsCad,
        deliveryAddressStreet: orders.deliveryAddressStreet,
        deliveryAddressCity: orders.deliveryAddressCity,
      })
      .from(dispatchOffers)
      .innerJoin(vendors, eq(vendors.id, dispatchOffers.vendorId))
      .innerJoin(orders, eq(orders.id, dispatchOffers.orderId))
      .where(
        and(
          eq(dispatchOffers.courierId, courierId),
          isNull(dispatchOffers.outcome),
          sql`${dispatchOffers.expiresAt} > now()`
        )
      )
      .orderBy(asc(dispatchOffers.expiresAt));

    return rows.map((r) => ({
      ...r,
      distanceToPickupKm: Number(r.distanceToPickupKm),
      distanceToDropoffKm: Number(r.distanceToDropoffKm),
      estimatedEarningsCad: Number(r.estimatedEarningsCad),
    }));
  }

  /**
   * A courier takes the run.
   *
   * Two couriers can tap Accepter within the same second, and the loser has to
   * be told rather than silently handed a delivery someone else is already
   * driving. The compare-and-swap is the `order_deliveries` insert: its primary
   * key is `order_id`, so the second one violates it and loses. That is the
   * same rule the mock's `assignCourier` stated ("refuses an order that already
   * has a courier") but could only enforce because it was single-threaded.
   *
   * Note this does **not** advance the order status: picking the food up is a
   * separate act, and `ready` is still the truth until it happens.
   */
  async accept(courierId: string, offerId: string) {
    const [offer] = await this.db
      .select({
        id: dispatchOffers.id,
        orderId: dispatchOffers.orderId,
        expiresAt: dispatchOffers.expiresAt,
        outcome: dispatchOffers.outcome,
        distanceToPickupKm: dispatchOffers.distanceToPickupKm,
        distanceToDropoffKm: dispatchOffers.distanceToDropoffKm,
      })
      .from(dispatchOffers)
      .where(and(eq(dispatchOffers.id, offerId), eq(dispatchOffers.courierId, courierId)))
      .limit(1);
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.outcome) throw new ConflictException(`This offer was already ${offer.outcome}`);
    if (offer.expiresAt <= new Date()) throw new ConflictException('This offer has expired');

    const [courier] = await this.db
      .select({ vehicle: couriers.vehicle })
      .from(couriers)
      .where(eq(couriers.id, courierId))
      .limit(1);

    const toPickup = Number(offer.distanceToPickupKm);
    const toDropoff = Number(offer.distanceToDropoffKm);

    return this.db
      .transaction(async (tx) => {
        const claimed = await tx
          .insert(orderDeliveries)
          .values({
            orderId: offer.orderId,
            courierId,
            acceptedAt: new Date(),
            pickupEtaMin: legDurationMin(toPickup, courier.vehicle as VehicleType),
            dropoffEtaMin: legDurationMin(toDropoff, courier.vehicle as VehicleType),
            distanceKm: String(round2(toDropoff)),
            // A real secret, generated once and stored — never derived from the
            // order id, which travels in URLs and push payloads. See
            // `generateDeliveryPin`.
            pin: generateDeliveryPin(),
            tipCad: '0',
            // Provisional: frozen for real at completion, once the tip is known.
            earningsCad: String(courierEarnings(toDropoff)),
          })
          .onConflictDoNothing()
          .returning({ orderId: orderDeliveries.orderId });

        if (claimed.length === 0) {
          throw new ConflictException('Another courier has already taken this run');
        }

        await tx.update(dispatchOffers).set({ outcome: 'accepted' }).where(eq(dispatchOffers.id, offerId));

        // Every other live offer on this order is moot the moment one is
        // accepted. There should be at most one, but saying so costs a
        // statement and stops a stale offer sitting on someone's screen.
        await tx
          .update(dispatchOffers)
          .set({ outcome: 'expired' })
          .where(
            and(
              eq(dispatchOffers.orderId, offer.orderId),
              isNull(dispatchOffers.outcome),
              sql`${dispatchOffers.id} <> ${offerId}`
            )
          );

        return { orderId: offer.orderId };
      })
      .then(async (result) => ({ ...result, delivery: await this.deliveryFor(result.orderId) }));
  }

  /** A courier passes. The order goes back in the pool and the next tick offers it onward. */
  async decline(courierId: string, offerId: string) {
    const declined = await this.db
      .update(dispatchOffers)
      .set({ outcome: 'declined' })
      .where(and(eq(dispatchOffers.id, offerId), eq(dispatchOffers.courierId, courierId), isNull(dispatchOffers.outcome)))
      .returning({ id: dispatchOffers.id });
    if (declined.length === 0) throw new NotFoundException('No pending offer to decline');
    return { declined: true as const };
  }

  private async deliveryFor(orderId: string) {
    const [row] = await this.db.select().from(orderDeliveries).where(eq(orderDeliveries.orderId, orderId)).limit(1);
    if (!row) return null;
    return {
      ...row,
      distanceKm: Number(row.distanceKm),
      tipCad: Number(row.tipCad),
      earningsCad: Number(row.earningsCad),
    };
  }
}

/** The TypeScript twin of `distanceKmSql`, for values already in memory. */
function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(toRad(aLat)) * Math.cos(toRad(bLat));
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
