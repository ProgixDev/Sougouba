import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import {
  addresses,
  disputes,
  merchantSubscriptions,
  orderItems,
  orders,
  orderStatusHistory,
  products,
  profiles,
  vendors,
} from '../db/schema/index.js';
import type { Page } from '../catalog/dto/query.dto.js';
import type {
  CartInput,
  OpenDisputeInput,
  OrderQuery,
  PlaceOrderInput,
  ReplyDisputeInput,
} from './dto/order.dto.js';
import { assertTransition, isActiveStatus, type OrderStatus, type StatusActor } from './order-status.js';
import { priceOrder, roundCad, toStripeAmount, type PricedLine, type PricedOrder } from './pricing.js';
import { PaymentsService } from './payments.service.js';
import { CouponsService } from '../loyalty/coupons.service.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { SettingsService } from '../loyalty/settings.service.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService,
    private readonly loyalty: LoyaltyService,
    private readonly coupons: CouponsService,
    private readonly settings: SettingsService
  ) {}

  // ── pricing ───────────────────────────────────────────────────────────────

  /**
   * Price a cart from the server's own records — the single place that decides
   * what an order is worth, used by the quote endpoint, by intent creation, and
   * again when the order is finally written.
   *
   * Everything is looked up rather than accepted: line prices from the
   * catalogue as it stands *now*, the shop's coordinates and the shopper's
   * address from their rows, the points balance from the ledger. The client
   * supplies ids and quantities and nothing else.
   */
  private async quote(customerId: string, cart: CartInput) {
    const [vendor] = await this.db
      .select({
        id: vendors.id,
        name: vendors.name,
        status: vendors.status,
        lat: vendors.addressLat,
        lng: vendors.addressLng,
      })
      .from(vendors)
      .where(eq(vendors.id, cart.vendorId))
      .limit(1);
    if (!vendor) throw new NotFoundException('Vendor not found');
    // A shop the platform has not vouched for, or has taken offline, cannot
    // take orders — the same rule the catalogue browse applies, restated here
    // because a client could hold a vendor id from before a suspension.
    if (vendor.status !== 'approved') throw new ForbiddenException('This shop is not currently accepting orders');

    const [address] = await this.db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, cart.addressId), eq(addresses.profileId, customerId)))
      .limit(1);
    // A 404 rather than a 403: an address id you don't own should not be
    // confirmed to exist. Same rule as `AddressesService.findOwned`.
    if (!address) throw new NotFoundException('Address not found');

    const productIds = cart.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      // Two lines for one product would price correctly but write a duplicate
      // order line, and the merchant's picking list would read as two items.
      throw new BadRequestException('The same product appears more than once in the cart');
    }

    const rows = await this.db
      .select({
        id: products.id,
        vendorId: products.vendorId,
        name: products.name,
        priceCad: products.priceCad,
        stockQty: products.stockQty,
        isAvailable: products.isAvailable,
      })
      .from(products)
      .where(inArray(products.id, productIds));

    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines: PricedLine[] = cart.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new NotFoundException(`Product ${item.productId} not found`);
      // One vendor per order (resolved 2026-09-03, see the plan doc). A cart
      // spanning two shops is refused here rather than silently priced against
      // one shop's delivery distance.
      if (product.vendorId !== cart.vendorId) {
        throw new BadRequestException(`"${product.name}" is not sold by this shop`);
      }
      if (!product.isAvailable) throw new ConflictException(`"${product.name}" is no longer available`);
      if (product.stockQty < item.qty) {
        throw new ConflictException(`"${product.name}": only ${product.stockQty} left`);
      }
      return {
        productId: product.id,
        name: product.name,
        qty: item.qty,
        unitPriceCad: Number(product.priceCad),
      };
    });

    const [availablePoints, rates, coupon] = await Promise.all([
      this.loyalty.balance(customerId),
      this.settings.loyaltyRates(),
      this.coupons.tryResolve(cart.couponCode, { vendorId: cart.vendorId }),
    ]);

    const priced = priceOrder({
      items: lines,
      vendorLocation: { lat: vendor.lat, lng: vendor.lng },
      deliveryLocation: { lat: address.lat, lng: address.lng },
      requestedPoints: cart.redeemPoints,
      availablePoints,
      coupon,
      rates,
    });

    return { priced, vendor, address };
  }

  /** What the checkout screen shows before the payment sheet opens. */
  async quoteFor(customerId: string, cart: CartInput): Promise<PricedOrder> {
    const { priced } = await this.quote(customerId, cart);
    return priced;
  }

  /**
   * Create the PaymentIntent for a cart, priced server-side.
   *
   * No order row is written here on purpose: an intent may be abandoned or may
   * fail, and a row written now would be an order nobody paid for, sitting in
   * the merchant's queue.
   */
  async createPaymentIntent(customerId: string, cart: CartInput) {
    const { priced } = await this.quote(customerId, cart);

    // Phase 7's split. The commission is taken on the **subtotal**, not the
    // order total: the CDC says "calculée sur le montant de la vente", and TPS,
    // TVQ and the delivery fee are demonstrably not the merchant's sale — the
    // taxes are collected for the government and the fee pays the courier.
    // Taking 12 % of either would charge the merchant commission on money that
    // was never theirs. (`lib/monetization.ts` in the mobile app flags this as
    // the one line to change if the client reads "la vente" as the full total.)
    const [settings, connect] = await Promise.all([
      this.settings.all(),
      this.db
        .select({ accountId: merchantSubscriptions.stripeConnectAccountId })
        .from(merchantSubscriptions)
        .where(eq(merchantSubscriptions.vendorId, cart.vendorId))
        .limit(1),
    ]);

    const connectAccountId = connect[0]?.accountId ?? null;
    const applicationFeeCents = toStripeAmount(roundCad(priced.subtotalCad * settings.commissionRate));

    const intent = await this.payments.createIntent({
      amountCents: toStripeAmount(priced.totalCad),
      customerId,
      vendorId: cart.vendorId,
      // Only once the merchant can actually receive it — see `createIntent`.
      ...(connectAccountId ? { split: { connectAccountId, applicationFeeCents } } : {}),
    });

    return { ...intent, quote: priced };
  }

  // ── placing an order ──────────────────────────────────────────────────────

  /**
   * Write the order — after Stripe confirms the money moved.
   *
   * The cart is priced **again** here rather than trusting the quote the client
   * was shown: a price could have changed, or stock run out, between the intent
   * and this call. If the re-price no longer matches what was paid,
   * `assertPaidBy` refuses, and refusing is right — dispatching food against a
   * payment for a different amount is the failure worth preventing.
   */
  async place(customerId: string, input: PlaceOrderInput) {
    const [existing] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.stripePaymentIntentId, input.paymentIntentId))
      .limit(1);
    // A retry, a double-tap or a flaky network can deliver this twice. Return
    // the order that already exists instead of creating a second one against
    // one payment — and check before calling Stripe, so a retry is cheap.
    if (existing) return this.byId(customerId, existing.id, 'customer');

    const { priced, address } = await this.quote(customerId, input);

    await this.payments.assertPaidBy(input.paymentIntentId, {
      amountCents: toStripeAmount(priced.totalCad),
      customerId,
    });

    const [profile] = await this.db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, customerId))
      .limit(1);

    const orderId = await this.db.transaction(async (tx) => {
      const now = new Date();
      const [order] = await tx
        .insert(orders)
        .values({
          customerId,
          // Snapshot: an order must not change if the account's name later does.
          customerName: profile?.fullName ?? null,
          vendorId: input.vendorId,
          status: 'pending',
          subtotalCad: String(priced.subtotalCad),
          gstCad: String(priced.gstCad),
          qstCad: String(priced.qstCad),
          deliveryFeeCad: String(priced.deliveryFeeCad),
          pointsRedeemed: priced.pointsRedeemed > 0 ? priced.pointsRedeemed : null,
          pointsDiscountCad: priced.pointsRedeemed > 0 ? String(priced.pointsDiscountCad) : null,
          couponCode: priced.couponCode,
          couponDiscountCad: priced.couponCode ? String(priced.couponDiscountCad) : null,
          totalCad: String(priced.totalCad),
          // The delivery address is copied, not referenced: editing or deleting
          // a saved address must not rewrite where a past order went.
          deliveryAddressLabel: address.label,
          deliveryAddressStreet: address.street,
          deliveryAddressCity: address.city,
          deliveryAddressPostalCode: address.postalCode,
          deliveryAddressLat: address.lat,
          deliveryAddressLng: address.lng,
          stripePaymentIntentId: input.paymentIntentId,
          createdAt: now,
        })
        .returning({ id: orders.id });

      await tx.insert(orderItems).values(
        priced.items.map((line) => ({
          orderId: order.id,
          productId: line.productId,
          // Name and price snapshot: the catalogue is mutable, an order is not.
          name: line.name,
          qty: line.qty,
          unitPriceCad: String(line.unitPriceCad),
        }))
      );

      await tx.insert(orderStatusHistory).values({ orderId: order.id, status: 'pending', at: now });

      // Stock comes down in the same transaction as the order, guarded so two
      // simultaneous checkouts cannot both take the last unit: the `where`
      // re-checks the quantity the row actually has right now, and a zero-row
      // update means somebody else got there first.
      for (const line of priced.items) {
        const decremented = await tx
          .update(products)
          .set({ stockQty: sql`${products.stockQty} - ${line.qty}`, updatedAt: now })
          .where(and(eq(products.id, line.productId), sql`${products.stockQty} >= ${line.qty}`))
          .returning({ id: products.id });
        if (decremented.length === 0) {
          // Rolls the whole order back. The shopper has been charged at this
          // point, so this is logged loudly: it needs a refund, and Phase 6's
          // refund flow is where that becomes automatic.
          this.logger.error(
            `Order rolled back after payment ${input.paymentIntentId}: "${line.name}" went out of stock mid-checkout. REFUND REQUIRED.`
          );
          throw new ConflictException(`"${line.name}" sold out while you were paying — you have not been charged for an order`);
        }
      }

      // Both of these run inside the order's own transaction, so a rollback
      // (an item selling out mid-checkout, below) takes them with it: a
      // shopper must never lose points, or burn a limited coupon, on an order
      // that does not exist.
      if (priced.pointsRedeemed > 0) {
        await this.loyalty.debitForRedemption(tx, customerId, priced.pointsRedeemed, order.id);
      }
      if (priced.couponCode) {
        // Enforces the usage limit atomically — the count in `resolve` was
        // only advisory, so that a quote could show the right total.
        await this.coupons.redeem(tx, { code: priced.couponCode, customerId, orderId: order.id });
      }

      return order.id;
    });

    return this.byId(customerId, orderId, 'customer');
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  private async hydrate(rows: { id: string }[]) {
    if (rows.length === 0) return new Map<string, { items: unknown[]; statusHistory: unknown[]; dispute: unknown }>();
    const ids = rows.map((r) => r.id);

    const [items, history, openDisputes] = await Promise.all([
      this.db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          name: orderItems.name,
          qty: orderItems.qty,
          unitPriceCad: orderItems.unitPriceCad,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids)),
      this.db
        .select({ orderId: orderStatusHistory.orderId, status: orderStatusHistory.status, at: orderStatusHistory.at })
        .from(orderStatusHistory)
        .where(inArray(orderStatusHistory.orderId, ids)),
      this.db.select().from(disputes).where(inArray(disputes.orderId, ids)),
    ]);

    const map = new Map<string, { items: unknown[]; statusHistory: unknown[]; dispute: unknown }>();
    for (const id of ids) map.set(id, { items: [], statusHistory: [], dispute: null });
    for (const item of items) {
      map.get(item.orderId)!.items.push({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        unitPriceCad: Number(item.unitPriceCad),
      });
    }
    for (const event of history) {
      map.get(event.orderId)!.statusHistory.push({ status: event.status, at: event.at });
    }
    for (const dispute of openDisputes) {
      map.get(dispute.orderId)!.dispute = dispute;
    }
    // Oldest first, so the timeline reads top to bottom.
    for (const entry of map.values()) {
      (entry.statusHistory as { at: Date }[]).sort((a, b) => a.at.getTime() - b.at.getTime());
    }
    return map;
  }

  private toOrder(row: Record<string, unknown>, parts: { items: unknown[]; statusHistory: unknown[]; dispute: unknown }) {
    return {
      ...row,
      // `numeric` arrives as a string from postgres.js — see the note in
      // `catalog/mappers.ts`. Handing these to the app unconverted would make
      // every total string-concatenate.
      subtotalCad: Number(row.subtotalCad),
      gstCad: Number(row.gstCad),
      qstCad: Number(row.qstCad),
      deliveryFeeCad: Number(row.deliveryFeeCad),
      totalCad: Number(row.totalCad),
      pointsDiscountCad: row.pointsDiscountCad === null ? null : Number(row.pointsDiscountCad),
      couponDiscountCad: row.couponDiscountCad === null ? null : Number(row.couponDiscountCad),
      items: parts.items,
      statusHistory: parts.statusHistory,
      dispute: parts.dispute,
    };
  }

  /**
   * One order, visible to the three parties it concerns and nobody else.
   *
   * `scope` says which claim the caller is making, and each is checked against
   * the row rather than trusted: a customer sees their own, a merchant sees
   * orders placed with their shop. A 404 either way — an order id that exists
   * but isn't yours should not be distinguishable from one that doesn't.
   */
  async byId(userId: string, orderId: string, scope: 'customer' | 'merchant') {
    const ownership =
      scope === 'customer'
        ? eq(orders.customerId, userId)
        : sql`exists (select 1 from ${vendors} v where v.id = ${orders.vendorId} and v.owner_id = ${userId})`;

    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), ownership))
      .limit(1);
    if (!row) throw new NotFoundException('Order not found');

    const parts = await this.hydrate([row]);
    return this.toOrder(row, parts.get(row.id)!);
  }

  async listForCustomer(customerId: string, query: OrderQuery): Promise<Page<unknown>> {
    return this.list(eq(orders.customerId, customerId), query);
  }

  async listForVendorOwner(userId: string, query: OrderQuery): Promise<Page<unknown>> {
    const [vendor] = await this.db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1);
    if (!vendor) throw new NotFoundException('This account has no shop');
    return this.list(eq(orders.vendorId, vendor.id), query);
  }

  private async list(ownership: SQL, query: OrderQuery): Promise<Page<unknown>> {
    const conditions: SQL[] = [ownership];
    if (query.status) conditions.push(eq(orders.status, query.status));
    if (query.activeOnly) conditions.push(notInArray(orders.status, ['delivered', 'cancelled']));
    const where = and(...conditions)!;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(where)
        // Newest first, matching every list in the app. `id` breaks ties so a
        // page boundary can't repeat or drop a row when two share a timestamp.
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(orders).where(where),
    ]);

    const parts = await this.hydrate(rows);
    return {
      items: rows.map((row) => this.toOrder(row, parts.get(row.id)!)),
      total: counted?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  // ── status ────────────────────────────────────────────────────────────────

  /**
   * Advance or cancel an order, as the merchant.
   *
   * The courier's two steps are *not* reachable here even though
   * `STATUS_ACTOR` grants them to a courier: `ready → out_for_delivery` and
   * `out_for_delivery → delivered` each also write a pickup time, a proof of
   * delivery and a courier payout, so they belong to Phase 5's endpoints. This
   * one refuses them rather than offering a second, evidence-free route to
   * `delivered`.
   */
  async advanceAsMerchant(userId: string, orderId: string, to: OrderStatus) {
    const actor: StatusActor = 'merchant';

    const [vendor] = await this.db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1);
    if (!vendor) throw new NotFoundException('This account has no shop');

    const [order] = await this.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.vendorId, vendor.id)))
      .limit(1);
    if (!order) throw new NotFoundException('Order not found');

    assertTransition(order.status, to, actor);

    await this.db.transaction(async (tx) => {
      const now = new Date();
      // Re-check the status inside the write: two dashboard taps a moment apart
      // would otherwise both pass `assertTransition` against the same old value
      // and append two history rows for one move.
      const moved = await tx
        .update(orders)
        .set({ status: to })
        .where(and(eq(orders.id, orderId), eq(orders.status, order.status)))
        .returning({ id: orders.id });
      if (moved.length === 0) throw new ConflictException('The order status changed while you were acting on it');

      await tx.insert(orderStatusHistory).values({ orderId, status: to, at: now });
    });

    return this.byId(userId, orderId, 'merchant');
  }

  // ── disputes ──────────────────────────────────────────────────────────────

  /**
   * The shopper reports a problem (CDC addendum v1.1, §04).
   *
   * Only on an order that actually arrived: a dispute is about what was in the
   * bag, and there is no bag yet on an order still being prepared — that is a
   * cancellation question, which the merchant owns.
   */
  async openDispute(customerId: string, orderId: string, input: OpenDisputeInput) {
    const [order] = await this.db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
      .limit(1);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'delivered') {
      throw new BadRequestException('A dispute can only be opened on a delivered order');
    }

    const inserted = await this.db
      .insert(disputes)
      .values({ orderId, reason: input.reason, message: input.message, status: 'open' })
      // Reopening would overwrite what the shopper originally said, which is
      // the one part of a dispute nobody should be able to rewrite. The mock
      // returned the order unchanged; a conflict is the honest answer.
      .onConflictDoNothing()
      .returning({ orderId: disputes.orderId });
    if (inserted.length === 0) throw new ConflictException('A dispute is already open on this order');

    return this.byId(customerId, orderId, 'customer');
  }

  /** The merchant's answer. Settling the dispute is the back-office's call (Phase 6), not theirs. */
  async replyToDispute(userId: string, orderId: string, input: ReplyDisputeInput) {
    const [vendor] = await this.db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1);
    if (!vendor) throw new NotFoundException('This account has no shop');

    const [order] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.vendorId, vendor.id)))
      .limit(1);
    if (!order) throw new NotFoundException('Order not found');

    const updated = await this.db
      .update(disputes)
      .set({ status: 'answered', merchantReply: input.message, answeredAt: new Date() })
      // Only an open dispute takes a reply: one an admin has already resolved
      // or rejected is closed, and reopening it is Phase 6's call, not a
      // merchant's.
      .where(and(eq(disputes.orderId, orderId), inArray(disputes.status, ['open', 'answered'])))
      .returning({ orderId: disputes.orderId });
    if (updated.length === 0) throw new NotFoundException('No open dispute on this order');

    return this.byId(userId, orderId, 'merchant');
  }

  /** Exposed for Phase 5/6 to reuse the same visibility rule. */
  isActive(status: OrderStatus): boolean {
    return isActiveStatus(status);
  }
}
