import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { unwrap } from '../db/unwrap.js';

/**
 * The one shape an order leaves this API in — the app's `Order` type
 * (`data/types.ts` in the mobile repo), whichever party is asking.
 *
 * Before this existed each endpoint answered with its own slice: the shopper and
 * the merchant got the flat `orders` row (`deliveryAddressStreet`, …) with no
 * delivery; the courier got a hand-picked join keyed `orderId`. The app reads
 * `order.deliveryAddress.label`, `order.delivery.earningsCad`, `order.id` — so
 * opening an order crashed the shopper's app, and a courier's earnings summed
 * to zero because no run carried a `delivery`.
 *
 * Additive on purpose: every flat column is still there, so a client written
 * against the old rows (the admin back office) keeps working.
 *
 * `revealPin` is only ever true for the **shopper**. The PIN is what they read
 * aloud at the door; it proves the handover only while the courier cannot learn
 * it any other way. A merchant has no use for it, and a courier who could read
 * it from here could close a run without meeting anyone.
 *
 * `courierCard` attaches who is carrying the order — name, photo, phone,
 * vehicle — for the shopper and the shop. There is no other way for them to
 * learn it: `/couriers/me` is the courier's own file, and a roster endpoint
 * would be a directory of people's phone numbers. Before this, the tracking
 * card asked `/couriers/me`, got a 404, and never appeared.
 */
export type OrderView = Record<string, unknown> & { id: string };

type Parts = {
  items: unknown[];
  statusHistory: { status: string; at: string }[];
  dispute: unknown;
  delivery: Record<string, unknown> | null;
  courierIssue: unknown;
};

export async function hydrateOrders(
  db: Db,
  rawRows: Record<string, unknown>[],
  opts: { revealPin: boolean; courierCard: boolean }
): Promise<OrderView[]> {
  if (rawRows.length === 0) return [];
  const rows = camelize<(Record<string, unknown> & { id: string })[]>(rawRows);
  const ids = rows.map((r) => r.id);

  const [items, history, disputes, deliveries, issues] = await Promise.all([
    unwrap<{ orderId: string; productId: string; name: string; qty: number; unitPriceCad: string }[]>(
      db
        .from('order_items')
        .select('orderId:order_id, productId:product_id, name, qty, unitPriceCad:unit_price_cad')
        .in('order_id', ids)
    ),
    unwrap<{ orderId: string; status: string; at: string }[]>(
      db.from('order_status_history').select('orderId:order_id, status, at').in('order_id', ids)
    ),
    unwrap<Record<string, unknown>[]>(db.from('disputes').select('*').in('order_id', ids)),
    unwrap<Record<string, unknown>[]>(
      db
        .from('order_deliveries')
        .select(
          'order_id, courier_id, accepted_at, picked_up_at, delivered_at, pickup_eta_min, dropoff_eta_min, distance_km, pin, tip_cad, earnings_cad'
        )
        .in('order_id', ids)
    ),
    unwrap<Record<string, unknown>[]>(
      db.from('courier_issues').select('order_id, reason, message, at, status').in('order_id', ids)
    ),
  ]);

  const courierIds = [...new Set(deliveries.map((d) => d.courier_id as string))];
  const cards =
    opts.courierCard && courierIds.length > 0
      ? await unwrap<Record<string, unknown>[]>(
          db
            .from('couriers')
            .select('id, full_name, photo_url, phone, vehicle, plate, rating, delivery_count')
            .in('id', courierIds)
        )
      : [];
  const cardById = new Map(
    camelize<Record<string, any>[]>(cards).map((c) => [c.id as string, { ...c, rating: Number(c.rating) }])
  );

  const parts = new Map<string, Parts>();
  for (const id of ids) {
    parts.set(id, { items: [], statusHistory: [], dispute: null, delivery: null, courierIssue: null });
  }
  for (const item of items) {
    parts.get(item.orderId)!.items.push({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      unitPriceCad: Number(item.unitPriceCad),
    });
  }
  for (const event of history) {
    parts.get(event.orderId)!.statusHistory.push({ status: event.status, at: event.at });
  }
  for (const dispute of camelize<{ orderId: string }[]>(disputes)) {
    parts.get(dispute.orderId)!.dispute = dispute;
  }
  for (const d of camelize<Record<string, any>[]>(deliveries)) {
    const { orderId, pin, ...rest } = d;
    parts.get(orderId)!.delivery = {
      ...rest,
      // `numeric` columns reach JSON as strings through PostgREST.
      distanceKm: Number(rest.distanceKm),
      tipCad: Number(rest.tipCad),
      earningsCad: Number(rest.earningsCad),
      ...(opts.revealPin ? { pin } : {}),
      ...(cardById.has(rest.courierId) ? { courier: cardById.get(rest.courierId) } : {}),
    };
  }
  for (const issue of camelize<{ orderId: string }[]>(issues)) {
    const { orderId, ...rest } = issue;
    parts.get(orderId)!.courierIssue = rest;
  }
  // Oldest first, so the timeline reads top to bottom. `at` is an ISO string —
  // PostgREST never hands back a Date.
  for (const p of parts.values()) p.statusHistory.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return rows.map((row) => {
    const p = parts.get(row.id)!;
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      ...row,
      subtotalCad: Number(row.subtotalCad),
      gstCad: Number(row.gstCad),
      qstCad: Number(row.qstCad),
      deliveryFeeCad: Number(row.deliveryFeeCad),
      totalCad: Number(row.totalCad),
      pointsDiscountCad: num(row.pointsDiscountCad),
      couponDiscountCad: num(row.couponDiscountCad),
      deliveryAddress: {
        label: row.deliveryAddressLabel,
        street: row.deliveryAddressStreet,
        city: row.deliveryAddressCity,
        postalCode: row.deliveryAddressPostalCode,
        lat: num(row.deliveryAddressLat),
        lng: num(row.deliveryAddressLng),
      },
      items: p.items,
      statusHistory: p.statusHistory,
      dispute: p.dispute,
      delivery: p.delivery,
      courierIssue: p.courierIssue,
    };
  });
}
