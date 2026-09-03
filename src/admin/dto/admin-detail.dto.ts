/**
 * Response shapes for the back office's read endpoints, plus the numeric
 * helpers they all share.
 *
 * ── Why the helpers live here ───────────────────────────────────────────────
 *
 * postgres.js hands every `numeric` column back as a **string** — `"42.50"`,
 * not `42.5` — because a JS number cannot hold arbitrary precision and
 * silently rounding money is worse than making the caller decide. `catalog/
 * mappers.ts` makes the same argument at length for the consumer API.
 *
 * The consequence, if a single endpoint forgets: `"31.47" + "12.50"` is
 * `"31.4712.50"`, and a table sorted on the column puts `$9.00` above `$85.00`
 * because it collates as text. Six endpoints convert these, so they convert
 * them through one pair of functions rather than six hand-written `Number()`
 * calls that can each be missed independently.
 */

/** `numeric` → number. For NOT NULL columns. */
export const num = (value: string): number => Number(value);

/** `numeric | null` → `number | null`, keeping the null rather than turning it into 0. */
export const numOrNull = (value: string | null): number | null => (value === null ? null : Number(value));

/**
 * One row of `GET /admin/orders`.
 *
 * `vendorName` and `courierName` are joined server-side on purpose: the list
 * page would otherwise fetch every vendor to resolve names client-side, which
 * is what the mock does today and what stops working the moment the list is
 * paginated.
 *
 * `hasDispute`/`hasCourierIssue` are flags, not embedded objects — the table
 * only needs to know whether to show a warning badge, and both relations are
 * 1:1 on `order_id` so the left joins that produce them cannot fan rows out.
 */
export interface AdminOrderListItem {
  id: string;
  status: string;
  createdAt: Date;
  subtotalCad: number;
  totalCad: number;
  customerId: string;
  customerName: string | null;
  vendorId: string;
  vendorName: string;
  vendorType: string;
  courierName: string | null;
  refundedAt: Date | null;
  refundAmountCad: number | null;
  hasDispute: boolean;
  hasCourierIssue: boolean;
}

/**
 * `GET /admin/orders/:id` — the whole order, grouped so the detail page's
 * cards map onto it one-to-one rather than the client re-assembling a flat row.
 *
 * ⚠️ `order_deliveries.pin` is deliberately **not** here. It is the four digits
 * a shopper reads out to prove delivery happened; putting it in a JSON response
 * the browser caches is a downgrade of the one thing it exists to protect. If
 * an arbitration case ever genuinely needs it, that argues for a separate,
 * audited endpoint — not a field on a routine read.
 */
export interface AdminOrderDetail {
  id: string;
  status: string;
  createdAt: Date;
  stripePaymentIntentId: string | null;

  customer: { id: string; fullName: string; avatarUrl: string | null; memberSince: Date | null } | null;
  /** The checkout-time snapshot, which may differ from the account's current name. */
  customerName: string | null;

  vendor: {
    id: string;
    name: string;
    slug: string;
    vendorType: string;
    city: string;
    addressStreet: string;
    addressPostalCode: string;
  };

  items: { id: string; productId: string; name: string; qty: number; unitPriceCad: number; lineTotalCad: number }[];

  totals: {
    subtotalCad: number;
    gstCad: number;
    qstCad: number;
    deliveryFeeCad: number;
    pointsRedeemed: number | null;
    pointsDiscountCad: number | null;
    couponCode: string | null;
    couponDiscountCad: number | null;
    totalCad: number;
  };

  /** Null when the order was never refunded — not a zeroed object. */
  refund: {
    refundedAt: Date;
    refundAmountCad: number | null;
    stripeRefundId: string | null;
    refundReason: string | null;
  } | null;

  deliveryAddress: {
    label: string;
    street: string;
    city: string;
    postalCode: string;
    lat: number;
    lng: number;
  };

  statusHistory: { status: string; at: Date }[];

  delivery: {
    courier: { id: string; fullName: string; phone: string; vehicle: string } | null;
    acceptedAt: Date;
    pickedUpAt: Date | null;
    deliveredAt: Date | null;
    pickupEtaMin: number;
    dropoffEtaMin: number;
    distanceKm: number;
    tipCad: number;
    earningsCad: number;
    paidOutAt: Date | null;
    /** A Storage path in the private `delivery-proofs` bucket — not directly renderable. */
    proof: { method: string; imagePath: string | null; note: string | null; at: Date } | null;
  } | null;

  dispute: {
    reason: string;
    message: string;
    openedAt: Date;
    status: string;
    merchantReply: string | null;
    answeredAt: Date | null;
    resolvedAt: Date | null;
  } | null;

  courierIssue: { reason: string; message: string; at: Date; status: string; resolvedAt: Date | null } | null;
}

/**
 * `GET /admin/stats/overview?range=7|30|90`.
 *
 * `ordersByVertical` carries the raw enum values `'grocery' | 'restaurant'`,
 * **not** French labels. The dashboard's mock bakes `'Épicerie'`/`'Restaurant'`
 * into the payload today; the API stays language-neutral, and
 * `admin/lib/statusMeta.ts` already owns every other French label in that app.
 *
 * `queues` nests the whole `stats()` row rather than hand-picking the six
 * counts the dashboard uses. It is a superset, `GET /admin/stats` returns the
 * identical shape, and one implementation means the two endpoints cannot drift
 * apart.
 */
export interface AdminOverviewStats {
  range: 7 | 30 | 90;
  /** ISO bounds of the window, so the chart can label the period it is showing. */
  from: string;
  to: string;

  gmvCad: number;
  gmvDeltaPct: number;
  orderCount: number;
  orderDeltaPct: number;
  /** `sum(subtotal) × commissionRate` — taxes and the delivery fee excluded, as the mock has it. */
  commissionRevenueCad: number;
  /**
   * Exposed separately rather than netted out of `gmvCad`. GMV counts a
   * refunded order at full value, matching both the mock and `GET
   * /admin/orders`; silently netting refunds would make the headline disagree
   * with the list underneath it.
   */
  refundedCad: number;
  averageOrderValueCad: number;

  /** Exactly `range` entries, oldest first, with empty days present as zeros. */
  series: { date: string; gmv: number; orders: number }[];
  topVendors: { vendorId: string; name: string; vendorType: string; revenueCad: number; orderCount: number }[];
  /** Always both verticals, so the chart does not change shape between ranges. */
  ordersByVertical: { vertical: 'grocery' | 'restaurant'; orders: number }[];

  queues: {
    vendorsPending: number;
    vendorsApproved: number;
    couriersPending: number;
    couriersApproved: number;
    couriersOnline: number;
    ordersToday: number;
    ordersActive: number;
    ordersUnassigned: number;
    disputesOpen: number;
    courierIssuesOpen: number;
    customers: number;
  };
}
