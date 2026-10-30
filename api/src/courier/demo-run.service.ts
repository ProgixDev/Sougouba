import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import { courierEarnings } from './courier-pay.js';
import { offerExpiryFrom } from './dispatch-rules.js';
import { haversine } from './dispatch.service.js';

/** How the demo orders are told apart: the courier is the customer, under this name. */
export const DEMO_CUSTOMER_NAME = 'Course de démonstration';

/** Where the bag goes: another shop's real address, this far from the pickup if one exists. */
const DROPOFF_MIN_KM = 1;
const DROPOFF_MAX_KM = 4;
const DROPOFF_IDEAL_KM = 2.5;

type ShopRow = {
  id: string;
  name: string;
  city: string;
  street: string;
  postalCode: string;
  lat: number;
  lng: number;
};

/** Same reading as `config/runtime.ts`: '0', 'false' and empty all mean off. */
function truthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
}

/**
 * Test phase only: a run for a courier to practise on.
 *
 * A real order, not a mock — `ready` at the shop nearest the courier, offered
 * to them directly — so everything after it is the production path: the offer
 * card and its countdown, accept, pickup, the proof upload, the frozen fare.
 * What a real run needs from two other people (a shopper who paid, a merchant
 * who packed) is what this stands in for.
 *
 * The courier is the order's customer, under `DEMO_CUSTOMER_NAME`. That keeps
 * a stranger's name and address out of it, and it is why their run view shows
 * the delivery code: it is their own order's code (`DeliveryService.run`).
 *
 * Totals are 0 $ so a shop's revenue is not inflated by practice runs, and the
 * drop-off is another shop's real street address, so the route on the map is
 * a real one.
 */
@Injectable()
export class DemoRunService {
  private readonly logger = new Logger(DemoRunService.name);
  private readonly enabled: boolean;

  constructor(
    @Inject(DB) private readonly db: Db,
    config: ConfigService<Env, true>
  ) {
    this.enabled = truthy(config.get('ALLOW_DEMO_RUNS', { infer: true }));
    if (this.enabled) {
      this.logger.error('ALLOW_DEMO_RUNS is set: couriers can create demonstration orders. Unset it before delivery.');
    }
  }

  async create(userId: string) {
    if (!this.enabled) throw new NotFoundException();

    const courier = await unwrap<{ id: string; status: string; vehicle: string; lat: number; lng: number } | null>(
      this.db
        .from('couriers')
        .select('id, status, vehicle, lat:base_lat, lng:base_lng')
        .eq('user_id', userId)
        .maybeSingle()
    );
    if (!courier) throw new NotFoundException('This account has no courier file');
    if (courier.status !== 'approved') throw new ConflictException('Votre dossier doit être approuvé');

    // One thing at a time, as with real dispatch: a courier with a bag or an
    // offer on screen is not handed a second.
    const carrying = await unwrap<{ order_id: string }[]>(
      this.db.from('order_deliveries').select('order_id').eq('courier_id', courier.id).is('delivered_at', null)
    );
    if (carrying.length > 0) {
      const open = await unwrap<{ id: string }[]>(
        this.db
          .from('orders')
          .select('id')
          .in('id', carrying.map((c) => c.order_id))
          .not('status', 'in', '(delivered,cancelled)')
      );
      if (open.length > 0) throw new ConflictException('Terminez votre course en cours avant d’en simuler une autre');
    }
    const offered = await unwrap<{ id: string }[]>(
      this.db
        .from('dispatch_offers')
        .select('id')
        .eq('courier_id', courier.id)
        .is('outcome', null)
        .gt('expires_at', new Date().toISOString())
    );
    if (offered.length > 0) throw new ConflictException('Une offre vous attend déjà');

    await this.cancelStaleDemos(userId);

    const shops = await unwrap<ShopRow[]>(
      this.db
        .from('vendors')
        .select('id, name, city, street:address_street, postalCode:address_postal_code, lat:address_lat, lng:address_lng')
        .eq('status', 'approved')
    );
    if (shops.length < 2) throw new ConflictException('Pas assez de commerces approuvés pour simuler une course');

    const byDistance = (from: { lat: number; lng: number }) => (a: ShopRow, b: ShopRow) =>
      haversine(from.lat, from.lng, a.lat, a.lng) - haversine(from.lat, from.lng, b.lat, b.lng);
    const pickup = [...shops].sort(byDistance(courier))[0];

    const others = shops.filter((s) => s.id !== pickup.id);
    const kmFrom = (s: ShopRow) => haversine(pickup.lat, pickup.lng, s.lat, s.lng);
    const inBand = others.filter((s) => kmFrom(s) >= DROPOFF_MIN_KM && kmFrom(s) <= DROPOFF_MAX_KM);
    const dropoff = (inBand.length > 0 ? inBand : others).sort(
      (a, b) => Math.abs(kmFrom(a) - DROPOFF_IDEAL_KM) - Math.abs(kmFrom(b) - DROPOFF_IDEAL_KM)
    )[0];

    // One line for the courier to collect — the shop's own product, at 0 $.
    const product = await unwrap<{ id: string; name: string } | null>(
      this.db.from('products').select('id, name').eq('vendor_id', pickup.id).limit(1).maybeSingle()
    );

    const now = new Date();
    const order = await unwrap<{ id: string }>(
      this.db
        .from('orders')
        .insert({
          customer_id: userId,
          customer_name: DEMO_CUSTOMER_NAME,
          vendor_id: pickup.id,
          status: 'ready',
          subtotal_cad: 0,
          gst_cad: 0,
          qst_cad: 0,
          delivery_fee_cad: 0,
          total_cad: 0,
          delivery_address_label: 'Démo',
          delivery_address_street: dropoff.street,
          delivery_address_city: dropoff.city,
          delivery_address_postal_code: dropoff.postalCode,
          delivery_address_lat: dropoff.lat,
          delivery_address_lng: dropoff.lng,
        })
        .select('id')
        .single()
    );

    await Promise.all([
      unwrap(
        this.db.from('order_status_history').insert({ order_id: order.id, status: 'ready', at: now.toISOString() })
      ),
      product
        ? unwrap(
            this.db
              .from('order_items')
              .insert({ order_id: order.id, product_id: product.id, name: product.name, qty: 1, unit_price_cad: 0 })
          )
        : Promise.resolve(),
    ]);

    const toPickup = haversine(courier.lat, courier.lng, pickup.lat, pickup.lng);
    const toDropoff = kmFrom(dropoff);
    const offer = await unwrap<{ id: string; expires_at: string }>(
      this.db
        .from('dispatch_offers')
        .insert({
          order_id: order.id,
          courier_id: courier.id,
          vendor_id: pickup.id,
          expires_at: offerExpiryFrom(now).toISOString(),
          distance_to_pickup_km: round2(toPickup),
          distance_to_dropoff_km: round2(toDropoff),
          estimated_earnings_cad: courierEarnings(toDropoff),
        })
        .select('id, expires_at')
        .single()
    );

    this.logger.warn(`Demo run ${order.id} offered to courier ${courier.id} (ALLOW_DEMO_RUNS)`);
    return {
      orderId: order.id,
      offerId: offer.id,
      vendorName: pickup.name,
      dropoffCity: dropoff.city,
      distanceToPickupKm: round2(toPickup),
      distanceToDropoffKm: round2(toDropoff),
    };
  }

  /**
   * Cancel this courier's earlier demo orders that nobody took — declined, or
   * left to expire — so they do not sit `ready` in a shop's list forever.
   */
  private async cancelStaleDemos(userId: string) {
    const stale = await unwrap<{ id: string }[]>(
      this.db
        .from('orders')
        .select('id')
        .eq('customer_id', userId)
        .eq('customer_name', DEMO_CUSTOMER_NAME)
        .eq('status', 'ready')
    );
    if (stale.length === 0) return;
    const taken = await unwrap<{ order_id: string }[]>(
      this.db.from('order_deliveries').select('order_id').in('order_id', stale.map((s) => s.id))
    );
    const untaken = stale.map((s) => s.id).filter((id) => !taken.some((t) => t.order_id === id));
    if (untaken.length === 0) return;
    await unwrap(this.db.from('orders').update({ status: 'cancelled' }).in('id', untaken));
    await unwrap(
      this.db
        .from('order_status_history')
        .insert(untaken.map((id) => ({ order_id: id, status: 'cancelled', at: new Date().toISOString() })))
    );
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
