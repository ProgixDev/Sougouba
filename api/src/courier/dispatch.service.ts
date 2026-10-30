import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { one } from '../db/embed.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { courierEarnings, generateDeliveryPin, legDurationMin, type VehicleType } from './courier-pay.js';
import { HEARTBEAT_TTL_MS, MAX_PICKUP_DISTANCE_KM, offerExpiryFrom } from './dispatch-rules.js';
import { NotifyService } from '../notifications/notify.service.js';

/**
 * The SQL half of the great-circle distance now lives in
 * `dispatch_next_courier` (migration `rpc_dispatch_scheduler`), because the
 * ranking has to happen in the database: ranking in Node would mean pulling
 * every online courier into memory on every tick to sort them — a full scan of
 * the roster every few seconds to pick one row — and ranking *after* a LIMIT
 * would rank the wrong candidates entirely.
 *
 * `haversine` below is still the TypeScript twin, for values already in memory.
 */

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notify: NotifyService
  ) {}

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
    // `expires_at <= now()` is evaluated by the database, not by a clock this
    // process holds — a scheduler whose host drifts would otherwise expire
    // offers early or late.
    const count = await unwrapRpc<number>(this.db.rpc('dispatch_expire_lapsed'));
    if (count > 0) this.logger.log(`Expired ${count} dispatch offer(s)`);
    return count;
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
    const rows = await unwrap<
      {
        order_id: string;
        vendor_id: string;
        pickup_lat: number;
        pickup_lng: number;
        dropoff_lat: number;
        dropoff_lng: number;
      }[]
    >(this.db.rpc('dispatch_waiting_orders', { p_limit: 50 }));

    const waiting = rows.map((r) => ({
      orderId: r.order_id,
      vendorId: r.vendor_id,
      pickupLat: r.pickup_lat,
      pickupLng: r.pickup_lng,
      dropoffLat: r.dropoff_lat,
      dropoffLng: r.dropoff_lng,
    }));

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

    // Four `not exists` correlations plus a distance used in the WHERE, the
    // ORDER BY and the projection — see `dispatch_next_courier`.
    const [candidate] = await unwrap<
      { id: string; vehicle: string; distance_to_pickup_km: number }[]
    >(
      this.db.rpc('dispatch_next_courier', {
        p_order_id: order.orderId,
        p_pickup_lat: order.pickupLat,
        p_pickup_lng: order.pickupLng,
        p_stale_before: staleBefore.toISOString(),
        p_max_pickup_km: MAX_PICKUP_DISTANCE_KM,
      })
    );

    if (!candidate) {
      // Not an error: every nearby courier may have passed, or none may be on
      // shift. The order waits for the next tick. Phase 10's alerting is where
      // "waiting too long" becomes someone's problem.
      return false;
    }

    const toDropoff = haversine(order.pickupLat, order.pickupLng, order.dropoffLat, order.dropoffLng);

    // Two ticks overlapping would otherwise both offer the same pair. The
    // unique index makes the second a duplicate-key error rather than a second
    // offer, and it is swallowed for the same reason `onConflictDoNothing` was.
    const { error } = await this.db.from('dispatch_offers').insert({
      order_id: order.orderId,
      courier_id: candidate.id,
      vendor_id: order.vendorId,
      expires_at: offerExpiryFrom().toISOString(),
      distance_to_pickup_km: round2(Number(candidate.distance_to_pickup_km)),
      distance_to_dropoff_km: round2(toDropoff),
      // The tip is unknown at offer time and is not promised here. Quoting a
      // number that later shrinks is worse than quoting the floor.
      estimated_earnings_cad: courierEarnings(toDropoff),
    });
    if (error && error.code !== UNIQUE_VIOLATION) throw unexpectedDbError(error);

    // Only for an offer this tick actually created — the duplicate a racing
    // tick lost was already pushed by the tick that won.
    if (!error) {
      await this.notify.offerMade({
        courierId: candidate.id,
        vendorId: order.vendorId,
        distanceToPickupKm: Number(candidate.distance_to_pickup_km),
        earningsCad: courierEarnings(toDropoff),
      });
    }

    return true;
  }

  /** A courier's own live offer, if they have one. */
  async pendingOffersFor(courierId: string) {
    const rows = await unwrap<any[]>(
      this.db
        .from('dispatch_offers')
        .select(
          `id, orderId:order_id, vendorId:vendor_id, offeredAt:offered_at, expiresAt:expires_at,
           distanceToPickupKm:distance_to_pickup_km, distanceToDropoffKm:distance_to_dropoff_km,
           estimatedEarningsCad:estimated_earnings_cad,
           vendors!inner(vendorName:name),
           orders!inner(deliveryAddressStreet:delivery_address_street,
                        deliveryAddressCity:delivery_address_city)`
        )
        .eq('courier_id', courierId)
        .is('outcome', null)
        // Compared against the database's clock, not this process's.
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: true })
    );

    return rows.map((r) => {
      const vendor = one<any>(r.vendors);
      const order = one<any>(r.orders);
      return {
        id: r.id,
        orderId: r.orderId,
        vendorId: r.vendorId,
        vendorName: vendor?.vendorName,
        offeredAt: r.offeredAt,
        expiresAt: r.expiresAt,
        distanceToPickupKm: Number(r.distanceToPickupKm),
        distanceToDropoffKm: Number(r.distanceToDropoffKm),
        estimatedEarningsCad: Number(r.estimatedEarningsCad),
        deliveryAddressStreet: order?.deliveryAddressStreet,
        deliveryAddressCity: order?.deliveryAddressCity,
      };
    });
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
    const offer = await unwrap<{
      id: string;
      orderId: string;
      expiresAt: string;
      outcome: string | null;
      distanceToPickupKm: string;
      distanceToDropoffKm: string;
    } | null>(
      this.db
        .from('dispatch_offers')
        .select(
          `id, orderId:order_id, expiresAt:expires_at, outcome,
           distanceToPickupKm:distance_to_pickup_km, distanceToDropoffKm:distance_to_dropoff_km`
        )
        .eq('id', offerId)
        .eq('courier_id', courierId)
        .maybeSingle()
    );
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.outcome) throw new ConflictException(`This offer was already ${offer.outcome}`);
    // ⚠️ `expiresAt` is an ISO string here, not a Date — PostgREST returns
    // JSON. `offer.expiresAt <= new Date()` would compare a string to a Date
    // and silently coerce.
    if (Date.parse(offer.expiresAt) <= Date.now()) throw new ConflictException('This offer has expired');

    const courier = await unwrap<{ vehicle: string }>(
      this.db.from('couriers').select('vehicle').eq('id', courierId).single()
    );

    const toPickup = Number(offer.distanceToPickupKm);
    const toDropoff = Number(offer.distanceToDropoffKm);

    // The claim is the insert: `order_deliveries.order_id` is unique, so the
    // second courier to tap Accepter inserts nothing and is told, rather than
    // both being handed the same run. That is the rule the mock's
    // `assignCourier` stated but could only enforce because it was
    // single-threaded. See `dispatch_accept`.
    const orderId = await unwrapRpc<string>(
      this.db.rpc('dispatch_accept', {
        p_offer_id: offerId,
        p_order_id: offer.orderId,
        p_courier_id: courierId,
        p_pickup_eta_min: legDurationMin(toPickup, courier.vehicle as VehicleType),
        p_dropoff_eta_min: legDurationMin(toDropoff, courier.vehicle as VehicleType),
        p_distance_km: round2(toDropoff),
        // A real secret, generated once and stored — never derived from the
        // order id, which travels in URLs and push payloads.
        p_pin: generateDeliveryPin(),
        // Provisional: frozen for real at completion, once the tip is known.
        p_earnings_cad: courierEarnings(toDropoff),
      }),
      (error) => {
        if (error.code === ALREADY_TAKEN) throw new ConflictException(error.message);
        throw unexpectedDbError(error);
      }
    );

    return { orderId, delivery: await this.deliveryFor(orderId) };
  }

  /** A courier passes. The order goes back in the pool and the next tick offers it onward. */
  async decline(courierId: string, offerId: string) {
    const declined = await unwrap<{ id: string }[]>(
      this.db
        .from('dispatch_offers')
        .update({ outcome: 'declined' })
        .eq('id', offerId)
        .eq('courier_id', courierId)
        .is('outcome', null)
        .select('id')
    );
    if (declined.length === 0) throw new NotFoundException('No pending offer to decline');
    return { declined: true as const };
  }

  private async deliveryFor(orderId: string) {
    const row = await unwrap<Record<string, any> | null>(
      this.db.from('order_deliveries').select('*').eq('order_id', orderId).maybeSingle()
    );
    if (!row) return null;
    const mapped = camelize<Record<string, any>>(row);
    return {
      ...mapped,
      distanceKm: Number(mapped.distanceKm),
      tipCad: Number(mapped.tipCad),
      earningsCad: Number(mapped.earningsCad),
    };
  }
}

/** The TypeScript twin of `distanceKmSql`, for values already in memory. */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
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

/** `dispatch_accept` raises this when another courier claimed the run first. */
const ALREADY_TAKEN = 'SGB07';
/** Postgres's own code for "unique violation". */
const UNIQUE_VIOLATION = '23505';

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
