import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { courierInsurance, courierLocations, couriers, orderDeliveries, orders, profiles } from '../db/schema/index.js';
import { GeoService } from '../geo/geo.service.js';
import type { ApplyCourierInput, SetShiftInput, UpdateCourierInput } from './dto/courier.dto.js';

/** Postgres's own code for "unique violation". */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint_name: constraintName } = error as { code?: unknown; constraint_name?: unknown };
  return code === UNIQUE_VIOLATION && constraintName === constraint;
}

@Injectable()
export class CouriersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly geo: GeoService
  ) {}

  /**
   * A courier registers.
   *
   * Created `pending` and offered nothing until an administrator clears the
   * file — same gate the CDC puts in front of a shop, and for the same reason:
   * this person will be handed a stranger's dinner and their home address.
   *
   * `rating` and `deliveryCount` start at zero rather than at a flattering
   * default, matching the merchant rule.
   */
  async apply(userId: string, input: ApplyCourierInput) {
    const [existing] = await this.db.select({ id: couriers.id }).from(couriers).where(eq(couriers.userId, userId)).limit(1);
    if (existing) throw new ConflictException('This account already has a courier file');

    // The base is the courier's declared home area — the origin a dispatch
    // offer is ranked from until they go on shift and send a real position.
    const { lat, lng } = await this.geo.coordinatesFor(input.postalCode, input.city);

    const courierId = await this.db
      .transaction(async (tx) => {
        const [courier] = await tx
          .insert(couriers)
          .values({
            userId,
            fullName: input.fullName,
            phone: input.phone,
            vehicle: input.vehicle,
            plate: input.plate ?? null,
            licenceNumber: input.licenceNumber ?? null,
            city: input.city,
            postalCode: input.postalCode,
            baseLat: lat,
            baseLng: lng,
            status: 'pending',
            isOnline: false,
          })
          .returning({ id: couriers.id });

        if (input.vehicle !== 'bike') {
          await tx.insert(courierInsurance).values({
            courierId: courier.id,
            insurerName: input.insurerName!,
            policyNumber: input.insurancePolicy!,
            expiry: input.insuranceExpiry!,
          });
        }

        await tx.update(profiles).set({ courierId: courier.id, updatedAt: new Date() }).where(eq(profiles.id, userId));
        return courier.id;
      })
      .catch((error: unknown) => {
        // The pre-check above is a friendly fast path, not the guarantee — two
        // taps a moment apart both pass it. `couriers_user_id_unique` is what
        // holds the rule.
        if (isUniqueViolation(error, 'couriers_user_id_unique')) {
          throw new ConflictException('This account already has a courier file');
        }
        throw error;
      });

    return this.byId(courierId);
  }

  /** The courier's own file, at any status — how a pending applicant watches their queue position. */
  async mine(userId: string) {
    const [row] = await this.db.select({ id: couriers.id }).from(couriers).where(eq(couriers.userId, userId)).limit(1);
    if (!row) throw new NotFoundException('This account has no courier file');
    return this.byId(row.id);
  }

  private async byId(courierId: string) {
    const [courier] = await this.db.select().from(couriers).where(eq(couriers.id, courierId)).limit(1);
    if (!courier) throw new NotFoundException('Courier not found');

    const [insurance] = await this.db
      .select()
      .from(courierInsurance)
      .where(eq(courierInsurance.courierId, courierId))
      .limit(1);

    return {
      ...courier,
      rating: Number(courier.rating),
      insurance: insurance ?? null,
    };
  }

  /** The id behind the token, and the ownership check every courier route reuses. */
  async courierIdFor(userId: string): Promise<string> {
    const [row] = await this.db.select({ id: couriers.id }).from(couriers).where(eq(couriers.userId, userId)).limit(1);
    if (!row) throw new NotFoundException('This account has no courier file');
    return row.id;
  }

  async update(userId: string, patch: UpdateCourierInput) {
    const courierId = await this.courierIdFor(userId);
    await this.db.update(couriers).set(patch).where(eq(couriers.id, courierId));
    return this.byId(courierId);
  }

  /**
   * Going on or off shift.
   *
   * Going online writes the courier's current position over their base, because
   * that is what the dispatcher ranks from — a courier standing downtown should
   * be offered downtown runs, not runs near where they registered.
   *
   * Only an **approved** courier can go online. A pending or suspended file
   * flipping the switch would put someone the platform has not cleared into the
   * dispatch pool.
   */
  async setShift(userId: string, input: SetShiftInput) {
    const courierId = await this.courierIdFor(userId);
    const [courier] = await this.db.select({ status: couriers.status }).from(couriers).where(eq(couriers.id, courierId)).limit(1);

    if (input.isOnline && courier.status !== 'approved') {
      throw new ConflictException(
        courier.status === 'pending'
          ? 'Votre dossier est encore en cours de validation'
          : 'Votre compte livreur est suspendu'
      );
    }

    await this.db
      .update(couriers)
      .set({
        isOnline: input.isOnline,
        lastSeenAt: new Date(),
        ...(input.isOnline && input.lat !== undefined && input.lng !== undefined
          ? { baseLat: input.lat, baseLng: input.lng }
          : {}),
      })
      .where(eq(couriers.id, courierId));

    return this.byId(courierId);
  }

  /**
   * Keep-alive. Separate from a location ping because a courier waiting for
   * work is not carrying an order and has no `courier_locations` row to write —
   * without this, an idle courier would age out of the roster in two minutes
   * and stop being offered anything.
   */
  async heartbeat(userId: string, position?: { lat: number; lng: number }) {
    const courierId = await this.courierIdFor(userId);
    await this.db
      .update(couriers)
      .set({ lastSeenAt: new Date(), ...(position ? { baseLat: position.lat, baseLng: position.lng } : {}) })
      .where(eq(couriers.id, courierId));
    return { ok: true as const };
  }

  /**
   * A courier's finished runs, newest first — the SQL port of the client-side
   * reduce in `lib/courierAnalytics.ts`'s `summariseRuns`.
   *
   * Every figure comes from `order_deliveries.earnings_cad`, **frozen when the
   * run completed**, never re-derived from today's rates. Re-deriving would
   * silently rewrite a courier's history the day a rate changes, which is the
   * one thing an earnings screen must never do.
   */
  async earnings(userId: string, days: number) {
    const courierId = await this.courierIdFor(userId);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const window = and(
      eq(orderDeliveries.courierId, courierId),
      sql`${orderDeliveries.deliveredAt} is not null`,
      gte(orderDeliveries.deliveredAt, since)
    )!;

    const [totals] = await this.db
      .select({
        earningsCad: sql<string>`coalesce(sum(${orderDeliveries.earningsCad}), 0)`,
        tipsCad: sql<string>`coalesce(sum(${orderDeliveries.tipCad}), 0)`,
        distanceKm: sql<string>`coalesce(sum(${orderDeliveries.distanceKm}), 0)`,
        runCount: sql<number>`count(*)::int`,
      })
      .from(orderDeliveries)
      .where(window);

    // Day buckets in the platform's own timezone, not UTC: a run delivered at
    // 20:00 Montreal time is 00:00 UTC the next day, and bucketing in UTC would
    // move a courier's whole evening onto tomorrow's bar.
    const buckets = await this.db
      .select({
        date: sql<string>`to_char((${orderDeliveries.deliveredAt} at time zone 'America/Montreal')::date, 'YYYY-MM-DD')`,
        earningsCad: sql<string>`coalesce(sum(${orderDeliveries.earningsCad}), 0)`,
        distanceKm: sql<string>`coalesce(sum(${orderDeliveries.distanceKm}), 0)`,
        runCount: sql<number>`count(*)::int`,
      })
      .from(orderDeliveries)
      .where(window)
      .groupBy(sql`(${orderDeliveries.deliveredAt} at time zone 'America/Montreal')::date`)
      .orderBy(sql`(${orderDeliveries.deliveredAt} at time zone 'America/Montreal')::date`);

    const runCount = totals?.runCount ?? 0;
    const earningsCad = Number(totals?.earningsCad ?? 0);

    return {
      days,
      earningsCad,
      tipsCad: Number(totals?.tipsCad ?? 0),
      distanceKm: Number(totals?.distanceKm ?? 0),
      runCount,
      avgPerRunCad: runCount > 0 ? Math.round((earningsCad / runCount) * 100) / 100 : 0,
      // Empty days are filled in by the client, which knows the window it asked
      // for. Emitting them here would mean generating a date series in SQL to
      // ship rows that are all zero.
      buckets: buckets.map((b) => ({
        date: b.date,
        earningsCad: Number(b.earningsCad),
        distanceKm: Number(b.distanceKm),
        runCount: b.runCount,
      })),
    };
  }

  /** Everything this courier has carried, newest first. */
  async runs(userId: string, limit: number, offset: number) {
    const courierId = await this.courierIdFor(userId);
    const rows = await this.db
      .select({
        orderId: orders.id,
        status: orders.status,
        vendorId: orders.vendorId,
        createdAt: orders.createdAt,
        deliveryAddressStreet: orders.deliveryAddressStreet,
        deliveryAddressCity: orders.deliveryAddressCity,
        acceptedAt: orderDeliveries.acceptedAt,
        pickedUpAt: orderDeliveries.pickedUpAt,
        deliveredAt: orderDeliveries.deliveredAt,
        distanceKm: orderDeliveries.distanceKm,
        tipCad: orderDeliveries.tipCad,
        earningsCad: orderDeliveries.earningsCad,
      })
      .from(orderDeliveries)
      .innerJoin(orders, eq(orders.id, orderDeliveries.orderId))
      .where(eq(orderDeliveries.courierId, courierId))
      .orderBy(desc(orderDeliveries.acceptedAt))
      .limit(limit)
      .offset(offset);

    return rows.map((r) => ({
      ...r,
      distanceKm: Number(r.distanceKm),
      tipCad: Number(r.tipCad),
      earningsCad: Number(r.earningsCad),
    }));
  }

  /**
   * The live position for one order's tracking map — the latest ping only.
   *
   * Replaces `lib/courierRoute.ts`'s simulation, which computed a position as a
   * pure function of elapsed time along a generated zig-zag. Nothing here is
   * derived: if the courier's app has not pinged, there is no position, and the
   * map says so rather than animating a courier who may not be moving.
   */
  async latestLocationForOrder(orderId: string) {
    const [ping] = await this.db
      .select({
        lat: courierLocations.lat,
        lng: courierLocations.lng,
        heading: courierLocations.heading,
        recordedAt: courierLocations.recordedAt,
      })
      .from(courierLocations)
      .where(eq(courierLocations.orderId, orderId))
      .orderBy(desc(courierLocations.recordedAt))
      .limit(1);
    return ping ?? null;
  }
}
