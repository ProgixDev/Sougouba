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

/**
 * Whose eyes a review is being shown to. The shopper wrote it and sees all of
 * it; the shop sees its own mark and the comment, never what was said about the
 * courier. Left out (the courier's reads, the admin's), no review is attached.
 */
export type ReviewAudience = 'customer' | 'merchant';

type ReviewRow = {
  orderId: string;
  vendorRating: number;
  courierRating: number | null;
  comment: string | null;
  createdAt: string;
  commentHiddenAt: string | null;
  removedAt: string | null;
};

/** PostgREST's and Postgres's "no such table" — see `reviewsFor`. */
const MISSING_TABLE = new Set(['PGRST205', '42P01']);
let warnedMissingReviews = false;

/**
 * The reviews on these orders.
 *
 * ⚠️ Unlike every other read here, a missing table is tolerated: it answers "no
 * reviews" instead of failing. This sits on the path of *every* order read, and
 * the code can reach a database before `0036_order_reviews.sql` does — at which
 * point a strict read would take down order history, tracking and the shop's
 * queue to protect a feature nobody can use yet. Any other error still throws.
 * Delete the tolerance once the migration is applied everywhere.
 */
async function reviewsFor(db: Db, orderIds: string[]): Promise<ReviewRow[]> {
  const { data, error } = await db
    .from('order_reviews')
    .select(
      'orderId:order_id, vendorRating:vendor_rating, courierRating:courier_rating, comment, createdAt:created_at, commentHiddenAt:comment_hidden_at, removedAt:removed_at'
    )
    .in('order_id', orderIds);
  if (error) {
    if (MISSING_TABLE.has(error.code)) {
      if (!warnedMissingReviews) {
        warnedMissingReviews = true;
        console.warn('[reviews] order_reviews does not exist yet — apply drizzle/0036_order_reviews.sql');
      }
      return [];
    }
    return unwrap<ReviewRow[]>(Promise.resolve({ data: null, error }));
  }
  return data ?? [];
}

type Parts = {
  items: unknown[];
  statusHistory: { status: string; at: string }[];
  dispute: unknown;
  delivery: Record<string, unknown> | null;
  courierIssue: unknown;
  review: unknown;
};

export async function hydrateOrders(
  db: Db,
  rawRows: Record<string, unknown>[],
  opts: { revealPin: boolean; courierCard: boolean; review?: ReviewAudience }
): Promise<OrderView[]> {
  if (rawRows.length === 0) return [];
  const rows = camelize<(Record<string, unknown> & { id: string })[]>(rawRows);
  const ids = rows.map((r) => r.id);

  const [items, history, disputes, deliveries, issues, reviews] = await Promise.all([
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
    opts.review ? reviewsFor(db, ids) : Promise.resolve([] as ReviewRow[]),
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
    parts.set(id, { items: [], statusHistory: [], dispute: null, delivery: null, courierIssue: null, review: null });
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
  for (const review of reviews) {
    const { orderId, courierRating, commentHiddenAt, removedAt, ...rest } = review;
    if (opts.review === 'customer') {
      // The customer keeps seeing what they wrote — moderation is about what
      // others read, not about rewriting their own record.
      parts.get(orderId)!.review = { ...rest, courierRating };
      continue;
    }
    // The merchant: a review the back office removed is not shown at all, and
    // a hidden comment leaves only the stars.
    if (removedAt) continue;
    parts.get(orderId)!.review = commentHiddenAt ? { ...rest, comment: null } : rest;
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
      review: p.review,
    };
  });
}
