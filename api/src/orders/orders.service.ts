import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import type { Page } from '../catalog/dto/query.dto.js';
import type {
  CancelOrderInput,
  CartInput,
  OpenDisputeInput,
  OrderQuery,
  PlaceOrderInput,
  ReplyDisputeInput,
  SubmitReviewInput,
} from './dto/order.dto.js';
import { OrderCancellationService } from './order-cancellation.service.js';
import { hydrateOrders } from './order-view.js';
import { assertTransition, isActiveStatus, type OrderStatus, type StatusActor } from './order-status.js';
import { priceOrder, roundCad, toStripeAmount, type PricedLine, type PricedOrder } from './pricing.js';
import { PaymentsService } from './payments.service.js';
import { ReceiptsService } from './receipts/receipts.service.js';
import { CouponsService } from '../loyalty/coupons.service.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { SettingsService } from '../loyalty/settings.service.js';
import { NotifyService } from '../notifications/notify.service.js';
import { isBanned } from '../auth/banned.js';
import { containsPattern } from '../common/sql/like.js';
import { orIlike } from '../common/sql/postgrest.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly payments: PaymentsService,
    private readonly loyalty: LoyaltyService,
    private readonly coupons: CouponsService,
    private readonly settings: SettingsService,
    private readonly notify: NotifyService,
    private readonly receipts: ReceiptsService,
    private readonly cancellation: OrderCancellationService
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
    const vendor = await unwrap<VendorRow | null>(
      this.db
        .from('vendors')
        .select('id, name, status, lat:address_lat, lng:address_lng')
        .eq('id', cart.vendorId)
        .maybeSingle()
    );
    if (!vendor) throw new NotFoundException('Vendor not found');
    // A shop the platform has not vouched for, or has taken offline, cannot
    // take orders — the same rule the catalogue browse applies, restated here
    // because a client could hold a vendor id from before a suspension.
    if (vendor.status !== 'approved') throw new ForbiddenException('This shop is not currently accepting orders');

    const address = await unwrap<AddressRow | null>(
      this.db
        .from('addresses')
        .select('label, street, city, postalCode:postal_code, lat, lng, unit, doorCode:door_code, deliveryNotes:delivery_notes, dropoff')
        .eq('id', cart.addressId)
        .eq('profile_id', customerId)
        .maybeSingle()
    );
    // A 404 rather than a 403: an address id you don't own should not be
    // confirmed to exist. Same rule as `AddressesService.findOwned`.
    if (!address) throw new NotFoundException('Address not found');

    const productIds = cart.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      // Two lines for one product would price correctly but write a duplicate
      // order line, and the merchant's picking list would read as two items.
      throw new BadRequestException('The same product appears more than once in the cart');
    }

    const rows = await unwrap<ProductRow[]>(
      this.db
        .from('products')
        .select(
          'id, vendorId:vendor_id, name, priceCad:price_cad, stockQty:stock_qty, isAvailable:is_available, hiddenAt:hidden_at'
        )
        .in('id', productIds)
    );

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
      // Hidden by the back office reads, to the shopper, exactly like withdrawn.
      if (!product.isAvailable || product.hiddenAt) {
        throw new ConflictException(`"${product.name}" is no longer available`);
      }
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
    // A blocked account keeps a valid access token for up to an hour after the
    // ban; this is the step that takes money, so it asks Auth directly.
    const { data: account } = await this.db.auth.admin.getUserById(customerId);
    if (isBanned(account.user?.banned_until)) {
      throw new ForbiddenException('Ce compte a été bloqué. Contactez le support Sougouba.');
    }

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
      unwrap<{ accountId: string | null } | null>(
        this.db
          .from('merchant_subscriptions')
          .select('accountId:stripe_connect_account_id')
          .eq('vendor_id', cart.vendorId)
          .maybeSingle()
      ),
    ]);

    const connectAccountId = connect?.accountId ?? null;
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
    const existing = await unwrap<{ id: string } | null>(
      this.db.from('orders').select('id').eq('stripe_payment_intent_id', input.paymentIntentId).maybeSingle()
    );
    // A retry, a double-tap or a flaky network can deliver this twice. Return
    // the order that already exists instead of creating a second one against
    // one payment — and check before calling Stripe, so a retry is cheap.
    if (existing) return this.byId(customerId, existing.id, 'customer');

    try {
      return await this.write(customerId, input);
    } catch (error) {
      // The shopper paid before this was called. If no order came of it, the
      // money goes back — unless a concurrent retry of this same checkout did
      // write the order, in which case this failure is only the loser of that
      // race and the payment is spent correctly.
      const written = await unwrap<{ id: string } | null>(
        this.db.from('orders').select('id').eq('stripe_payment_intent_id', input.paymentIntentId).maybeSingle()
      ).catch(() => null);
      if (!written) await this.payments.refundUnplacedOrder(input.paymentIntentId, customerId);
      throw error;
    }
  }

  private async write(customerId: string, input: PlaceOrderInput) {
    const { priced, address } = await this.quote(customerId, input);

    const payment = await this.payments.assertPaidBy(input.paymentIntentId, {
      amountCents: toStripeAmount(priced.totalCad),
      customerId,
    });

    const profile = await unwrap<{ fullName: string | null } | null>(
      this.db.from('profiles').select('fullName:full_name').eq('id', customerId).maybeSingle()
    );

    // All six writes — the order, its lines, the first history row, the guarded
    // stock decrements, the points debit and the coupon claim — land together
    // or not at all, inside `order_place` (migration `rpc_order_place`).
    //
    // The last two used to be handed the transaction itself
    // (`loyalty.debitForRedemption(tx, …)`, `coupons.redeem(tx, …)`). There is
    // no handle to pass over PostgREST, so they moved into the function rather
    // than becoming separate requests: a shopper must never lose points, or
    // burn a limited coupon, on an order that then rolls back.
    //
    // Pricing deliberately stays out of SQL — `priceOrder` remains the single
    // authority on what an order is worth and hands the result in, so the tax
    // and delivery formulas have no second copy to drift from.
    const delivery = {
      unit: input.delivery?.unit !== undefined ? input.delivery.unit : address.unit,
      doorCode: input.delivery?.doorCode !== undefined ? input.delivery.doorCode : address.doorCode,
      deliveryNotes: input.delivery?.deliveryNotes !== undefined ? input.delivery.deliveryNotes : address.deliveryNotes,
      dropoff: input.delivery?.dropoff ?? address.dropoff,
    };

    const orderId = await unwrapRpc<string>(
      this.db.rpc('order_place', {
        p_customer_id: customerId,
        // Snapshot: an order must not change if the account's name later does.
        //
        // Cast because the generated RPC types model every argument as
        // non-null. `orders.customer_name` is nullable and the SQL parameter
        // takes null happily — an account with no name on it is a real state,
        // not a missing value to invent one for.
        p_customer_name: (profile?.fullName ?? null) as string,
        p_vendor_id: input.vendorId,
        p_subtotal_cad: priced.subtotalCad,
        p_gst_cad: priced.gstCad,
        p_qst_cad: priced.qstCad,
        p_delivery_fee_cad: priced.deliveryFeeCad,
        p_total_cad: priced.totalCad,
        // The delivery address is copied, not referenced: editing or deleting
        // a saved address must not rewrite where a past order went.
        p_addr_label: address.label,
        p_addr_street: address.street,
        p_addr_city: address.city,
        p_addr_postal_code: address.postalCode,
        p_addr_lat: address.lat,
        p_addr_lng: address.lng,
        // How to reach the door: what the shopper confirmed at checkout, the
        // saved address's details for anything they did not touch.
        p_delivery_unit: (delivery.unit ?? null) as string,
        p_delivery_door_code: (delivery.doorCode ?? null) as string,
        p_delivery_notes: (delivery.deliveryNotes ?? null) as string,
        p_delivery_dropoff: delivery.dropoff,
        // Name and price snapshot: the catalogue is mutable, an order is not.
        p_items: priced.items.map((line) => ({
          productId: line.productId,
          name: line.name,
          qty: line.qty,
          unitPriceCad: line.unitPriceCad,
        })),
        p_payment_intent_id: input.paymentIntentId,
        p_points_redeemed: priced.pointsRedeemed > 0 ? priced.pointsRedeemed : undefined,
        p_points_discount_cad: priced.pointsRedeemed > 0 ? priced.pointsDiscountCad : undefined,
        p_coupon_code: priced.couponCode ?? undefined,
        p_coupon_discount_cad: priced.couponCode ? priced.couponDiscountCad : undefined,
      }),
      (error) => {
        if (error.code === SOLD_OUT) {
          // The whole order rolled back after the shopper was charged; `place`
          // refunds it on the way out.
          throw new ConflictException(error.message);
        }
        if (error.code === COUPON_EXHAUSTED || error.code === COUPON_ALREADY_USED) {
          throw new BadRequestException(error.message);
        }
        throw unexpectedDbError(error);
      }
    );

    // The shop hears about it while the receipt is being read back — in
    // parallel, never in sequence, and a failed push fails nothing. The
    // shopper's emailed receipt starts here too; `ReceiptsService` makes sure a
    // slow mail server is never what this response waits on.
    const [order] = await Promise.all([
      this.byId(customerId, orderId, 'customer'),
      this.notify.orderPlaced(orderId),
      this.rememberDelivery(customerId, input),
      this.receipts.orderPlaced(orderId),
      this.recordCommission(orderId, priced, payment),
    ]);
    return order;
  }

  /**
   * What Sougouba keeps on this order and what Stripe has already sent the
   * shop, written down while both are known — the shop's monthly statement is
   * drawn from these months later (`billing/statements/`).
   *
   * When the payment was split, the commission is the fee Stripe actually
   * withheld and the shop has received the rest. When it was not — the shop has
   * no Stripe account yet — the commission is the rate on the goods and nothing
   * has been sent: the whole payment is on Sougouba's balance, owed to the shop.
   *
   * Best effort, after the order exists: the order is paid and placed whether
   * or not this lands, and a statement falls back to the current rate for an
   * order with no record.
   */
  private async recordCommission(
    orderId: string,
    priced: PricedOrder,
    payment: { split: boolean; applicationFeeCents: number }
  ): Promise<void> {
    try {
      const { commissionRate } = await this.settings.all();
      const commissionCad = payment.split ? payment.applicationFeeCents / 100 : roundCad(priced.subtotalCad * commissionRate);
      const { error } = await this.db
        .from('orders')
        .update({
          commission_rate: commissionRate,
          commission_cad: commissionCad,
          merchant_paid_cad: payment.split ? roundCad(priced.totalCad - commissionCad) : 0,
        })
        .eq('id', orderId);
      if (error) this.logger.warn(`Commission of order ${orderId} not recorded: ${error.message}`);
    } catch (error) {
      this.logger.warn(`Commission of order ${orderId} not recorded: ${String(error)}`);
    }
  }

  /**
   * What the shopper confirmed at checkout becomes the address's default for
   * next time — the door code does not change between orders. Best effort:
   * the order is already placed, and a failure here costs only the prefill.
   */
  private async rememberDelivery(customerId: string, input: PlaceOrderInput): Promise<void> {
    const d = input.delivery;
    if (!d) return;
    const columns = {
      ...(d.unit !== undefined && { unit: d.unit }),
      ...(d.doorCode !== undefined && { door_code: d.doorCode }),
      ...(d.deliveryNotes !== undefined && { delivery_notes: d.deliveryNotes }),
      ...(d.dropoff !== undefined && { dropoff: d.dropoff }),
    };
    if (Object.keys(columns).length === 0) return;
    const { error } = await this.db.from('addresses').update(columns).eq('id', input.addressId).eq('profile_id', customerId);
    if (error) this.logger.warn(`Delivery details not saved on address ${input.addressId}: ${error.message}`);
  }

  // ── reads ─────────────────────────────────────────────────────────────────

  /**
   * One order, visible to the three parties it concerns and nobody else.
   *
   * `scope` says which claim the caller is making, and each is checked against
   * the row rather than trusted: a customer sees their own, a merchant sees
   * orders placed with their shop. A 404 either way — an order id that exists
   * but isn't yours should not be distinguishable from one that doesn't.
   */
  async byId(userId: string, orderId: string, scope: 'customer' | 'merchant') {
    // The merchant claim was an `exists` subquery against `vendors.owner_id`.
    // PostgREST has no correlated subquery, so the shop is resolved first and
    // the order filtered on its id — the same rule, one extra round trip.
    let query = this.db.from('orders').select('*').eq('id', orderId);
    if (scope === 'customer') {
      query = query.eq('customer_id', userId);
    } else {
      const vendor = await this.vendorOwnedBy(userId);
      query = query.eq('vendor_id', vendor.id);
    }

    const raw = await unwrap<Record<string, unknown> | null>(query.maybeSingle());
    if (!raw) throw new NotFoundException('Order not found');

    const [order] = await hydrateOrders(this.db, [raw], {
      revealPin: scope === 'customer',
      courierCard: true,
      review: scope,
    });
    return order;
  }

  /**
   * The latest GPS ping on one of the shopper's own orders. Ownership first, as
   * a 404 — a stranger's order id must not answer with a position.
   */
  async courierLocation(customerId: string, orderId: string) {
    const owned = await unwrap<{ id: string } | null>(
      this.db.from('orders').select('id').eq('id', orderId).eq('customer_id', customerId).maybeSingle()
    );
    if (!owned) throw new NotFoundException('Order not found');
    const ping = await unwrap<{ lat: number; lng: number; heading: number | null; recordedAt: string } | null>(
      this.db
        .from('courier_locations')
        .select('lat, lng, heading, recordedAt:recorded_at')
        .eq('order_id', orderId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    // Wrapped: a bare `null` goes out as an empty body, which is not JSON.
    return { location: ping ?? null };
  }

  async customerStats(customerId: string) {
    return unwrap<{ orderCount: number; spentCad: number }>(
      this.db.rpc('customer_order_stats', { p_customer_id: customerId })
    );
  }

  async listForCustomer(customerId: string, query: OrderQuery): Promise<Page<unknown>> {
    return this.list({ column: 'customer_id', value: customerId }, query);
  }

  /** Each chip of the merchant's orders tab: how many, and what they add up to. */
  async vendorOrderSummary(userId: string) {
    const vendor = await this.vendorOwnedBy(userId);
    return unwrap<Record<string, { count: number; amountCad: number }>>(
      this.db.rpc('vendor_order_summary', { p_vendor_id: vendor.id })
    );
  }

  async listForVendorOwner(userId: string, query: OrderQuery): Promise<Page<unknown>> {
    const vendor = await this.vendorOwnedBy(userId);
    return this.list({ column: 'vendor_id', value: vendor.id }, query);
  }

  private async list(ownership: { column: 'customer_id' | 'vendor_id'; value: string }, query: OrderQuery): Promise<Page<unknown>> {
    // One request instead of two: `count: 'exact'` returns the total alongside
    // the page, so the separate `count(*)` query is gone.
    // `disputes` lists only orders that have one: an inner embed filters the parent rows.
    // Typed as plain `*`: the string union defeats supabase-js's select parser,
    // and the embed is stripped from every row below anyway.
    const columns = (query.view === 'disputes' ? '*, disputes!inner(order_id)' : '*') as '*';
    let q = this.db.from('orders').select(columns, { count: 'exact' }).eq(ownership.column, ownership.value);
    if (query.status) q = q.eq('status', query.status);
    if (query.activeOnly) q = q.not('status', 'in', '("delivered","cancelled")');
    if (query.view === 'active') q = q.not('status', 'in', '("delivered","cancelled")');
    if (query.view === 'delivered') q = q.eq('status', 'delivered');
    if (query.view === 'cancelled') q = q.eq('status', 'cancelled');
    if (query.search) {
      // `containsPattern` escapes `%` and `_`, so a search cannot match every order.
      q = UUID_RE.test(query.search)
        ? q.eq('id', query.search.toLowerCase())
        : q.or(orIlike(['customer_name'], containsPattern(query.search)));
    }

    // Newest first, matching every list in the app — except the merchant's
    // active queue, worked from the oldest. `id` breaks ties so a page boundary
    // can't repeat or drop a row when two share a timestamp.
    const ascending = query.view === 'active';
    const { data, count, error } = await q
      .order('created_at', { ascending })
      .order('id', { ascending })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw unexpectedDbError(error);
    // The embed that filtered disputes is not part of an order.
    const rows = (data ?? []).map((row) => {
      const { disputes: _filter, ...order } = row as Record<string, unknown>;
      return order;
    });

    return {
      items: await hydrateOrders(this.db, rows, {
        revealPin: ownership.column === 'customer_id',
        courierCard: true,
        review: ownership.column === 'customer_id' ? 'customer' : 'merchant',
      }),
      total: count ?? 0,
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

    const vendor = await this.vendorOwnedBy(userId);

    const order = await unwrap<{ id: string; status: OrderStatus } | null>(
      this.db.from('orders').select('id, status').eq('id', orderId).eq('vendor_id', vendor.id).maybeSingle()
    );
    if (!order) throw new NotFoundException('Order not found');

    assertTransition(order.status, to, actor);

    // Cancelling is not a step along the way: it also gives the shopper their
    // money back, returns the stock and tells them. It used to be a bare status
    // change here, which left a cancelled order paid for.
    if (to === 'cancelled') {
      await this.cancellation.byMerchant(userId, vendor.id, orderId);
      return this.byId(userId, orderId, 'merchant');
    }

    // The move and its history row land together, and the status is re-checked
    // inside the write — two dashboard taps a moment apart would otherwise both
    // pass `assertTransition` against the same stale value and append two
    // history rows for one move. See migration `rpc_order_advance_status`.
    await unwrapRpc<void>(
      this.db.rpc('order_advance_status', { p_order_id: orderId, p_from: order.status, p_to: to }),
      (error) => {
        if (error.code === STATUS_MOVED) throw new ConflictException(error.message);
        throw unexpectedDbError(error);
      }
    );

    const [view] = await Promise.all([this.byId(userId, orderId, 'merchant'), this.notify.orderStatusChanged(orderId, to)]);
    return view;
  }

  /**
   * The shopper cancels their own order, with a reason — only while the shop
   * has not answered it. Refunded in full; see `OrderCancellationService`.
   */
  async cancelAsCustomer(customerId: string, orderId: string, input: CancelOrderInput) {
    await this.cancellation.byCustomer(customerId, orderId, input);
    return this.byId(customerId, orderId, 'customer');
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
    const order = await unwrap<{ id: string; status: OrderStatus } | null>(
      this.db.from('orders').select('id, status').eq('id', orderId).eq('customer_id', customerId).maybeSingle()
    );
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'delivered') {
      throw new BadRequestException('A dispute can only be opened on a delivered order');
    }

    // Reopening would overwrite what the shopper originally said, which is the
    // one part of a dispute nobody should be able to rewrite. The mock returned
    // the order unchanged; a conflict is the honest answer.
    //
    // `onConflictDoNothing().returning()` told the two cases apart by row count;
    // here the unique violation comes back as a SQLSTATE instead.
    const { error } = await this.db
      .from('disputes')
      .insert({ order_id: orderId, reason: input.reason, message: input.message, status: 'open' });
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new ConflictException('A dispute is already open on this order');
      throw unexpectedDbError(error);
    }

    const [view] = await Promise.all([this.byId(customerId, orderId, 'customer'), this.notify.disputeOpened(orderId)]);
    return view;
  }

  /** The merchant's answer. Settling the dispute is the back-office's call (Phase 6), not theirs. */
  async replyToDispute(userId: string, orderId: string, input: ReplyDisputeInput) {
    const vendor = await this.vendorOwnedBy(userId);

    const order = await unwrap<{ id: string } | null>(
      this.db.from('orders').select('id').eq('id', orderId).eq('vendor_id', vendor.id).maybeSingle()
    );
    if (!order) throw new NotFoundException('Order not found');

    // Only an open dispute takes a reply: one an admin has already resolved or
    // rejected is closed, and reopening it is Phase 6's call, not a merchant's.
    const updated = await unwrap<{ orderId: string }[]>(
      this.db
        .from('disputes')
        .update({ status: 'answered', merchant_reply: input.message, answered_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .in('status', ['open', 'answered'])
        .select('orderId:order_id')
    );
    if (updated.length === 0) throw new NotFoundException('No open dispute on this order');

    return this.byId(userId, orderId, 'merchant');
  }

  // ── reviews ───────────────────────────────────────────────────────────────

  /**
   * The shopper rates a delivered order: the shop always, the courier if they
   * choose to. Once per order, and not editable — a mark a shopper can revise
   * after the shop has answered a dispute is a bargaining chip, not a review.
   *
   * Every rule lives in `order_review_submit` (`drizzle/0036_order_reviews.sql`)
   * because the insert and the two refreshed averages have to be one
   * transaction, and the function is the only place this API has one.
   */
  async submitReview(customerId: string, orderId: string, input: SubmitReviewInput) {
    await unwrapRpc<void>(
      this.db.rpc('order_review_submit', {
        p_customer_id: customerId,
        p_order_id: orderId,
        p_vendor_rating: input.vendorRating,
        p_courier_rating: input.courierRating,
        p_comment: input.comment || undefined,
      }),
      (error) => {
        if (error.code === NOT_FOUND) throw new NotFoundException('Order not found');
        if (error.code === NOT_DELIVERED) {
          throw new BadRequestException('Vous pourrez noter cette commande une fois livrée.');
        }
        if (error.code === UNIQUE_VIOLATION) throw new ConflictException('Vous avez déjà noté cette commande.');
        throw unexpectedDbError(error);
      }
    );
    return this.byId(customerId, orderId, 'customer');
  }

  /** Exposed for Phase 5/6 to reuse the same visibility rule. */
  isActive(status: OrderStatus): boolean {
    return isActiveStatus(status);
  }

  /**
   * The signed-in merchant's shop.
   *
   * Was an inline `select … where owner_id = …` at four call sites; PostgREST
   * cannot express the `exists` correlation those sites used to rely on, so
   * the lookup is now explicit and shared rather than copied four times.
   */
  private async vendorOwnedBy(userId: string): Promise<{ id: string }> {
    const vendor = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    if (!vendor) throw new NotFoundException('This account has no shop');
    return vendor;
  }
}

// ── the refusals `order_place` and `order_advance_status` raise ──────────────
// Custom SQLSTATEs, so each maps to the status it always had rather than to a
// blanket 500. See the two `rpc_order_*` migrations.
const SOLD_OUT = 'SGB01';
const COUPON_EXHAUSTED = 'SGB02';
const COUPON_ALREADY_USED = 'SGB03';
const STATUS_MOVED = 'SGB04';
// `order_review_submit` (`drizzle/0036_order_reviews.sql`).
const NOT_FOUND = 'SGB05';
const NOT_DELIVERED = 'SGB09';
/** Postgres's own — https://www.postgresql.org/docs/current/errcodes-appendix.html */
const UNIQUE_VIOLATION = '23505';

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}

type VendorRow = { id: string; name: string; status: string; lat: number; lng: number };
type AddressRow = {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  lat: number;
  lng: number;
  unit: string | null;
  doorCode: string | null;
  deliveryNotes: string | null;
  dropoff: 'hand' | 'door';
};
type ProductRow = {
  id: string;
  vendorId: string;
  name: string;
  priceCad: string;
  stockQty: number;
  isAvailable: boolean;
  hiddenAt: string | null;
};
