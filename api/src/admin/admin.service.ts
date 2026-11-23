import { ConflictException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import type { Page } from '../catalog/dto/query.dto.js';
import { containsPattern, escapeLikePattern } from '../common/sql/like.js';
import type { Db } from '../db/client.js';
import { camelize } from '../db/case.js';
import { DB } from '../db/db.module.js';
import { one } from '../db/embed.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import {
  num,
  numOrNull,
  type AdminOrderDetail,
  type AdminOrderListItem,
  type AdminOverviewStats,
  type AdminSearchResult,
} from './dto/admin-detail.dto.js';
import type {
  AdminSearchQuery,
  CourierIssueQuery,
  DisputeQuery,
  OrderListQuery,
  ResolveCourierIssueInput,
  ResolveDisputeInput,
} from './dto/admin.dto.js';
import { RefundsService } from './refunds.service.js';
import { deltaPct, overviewWindow, round2, type OverviewRange } from './stats-window.js';
import { NotifyService } from '../notifications/notify.service.js';

/**
 * True for a query made only of hex digits and dashes — someone pasting back a
 * fragment of an order id rather than typing a name.
 *
 * Exported so a test can pin the branch: it decides between an indexable
 * prefix match on the uuid and a name search, and getting it wrong turns a
 * typeahead into a sequential scan of the orders table.
 */
export function looksLikeIdFragment(value: string): boolean {
  return /^[0-9a-fA-F-]{2,}$/.test(value);
}

/**
 * The back office's arbitration surface — CDC addendum §04's "gestion des
 * litiges".
 *
 * This is where the mock ran out of model rather than out of screens.
 * `OrderDispute.status` is a `'open' | 'answered'` union: there was no value
 * for *settled*, because nothing in the app was entitled to settle one. And
 * `CourierIssue` has no status at all — a courier could report that nobody
 * answered the door and the report would sit there forever, unread and
 * unclosable. Both enums gained their missing values in the first migration;
 * these are the endpoints that use them.
 */
export type InsightsArea =
  | 'vendors'
  | 'couriers'
  | 'orders'
  | 'users'
  | 'disputes'
  | 'courier_issues'
  | 'support'
  | 'moderation';

@Injectable()
export class AdminService {
  // No `AuditService` here any more: every audited action writes its own log
  // entry inside the transaction that makes the change. Only the *read* side
  // of the log is still a service, and only the controller needs it.
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly refunds: RefundsService,
    private readonly notify: NotifyService
  ) {}

  // ── disputes ──────────────────────────────────────────────────────────────

  async listDisputes(query: DisputeQuery): Promise<Page<unknown>> {
    // The two inner joins become one embed. `!inner` matters: without it
    // PostgREST left-joins, and a dispute whose order or shop had vanished
    // would come back with nulls where the queue expects a shop name.
    let q = this.db
      .from('disputes')
      .select(
        `orderId:order_id, reason, message, status, openedAt:opened_at,
         merchantReply:merchant_reply, answeredAt:answered_at, resolvedAt:resolved_at,
         orders!inner(
           orderTotalCad:total_cad, orderStatus:status, orderCreatedAt:created_at,
           refundedAt:refunded_at, refundAmountCad:refund_amount_cad, customerName:customer_name,
           vendors!inner(vendorName:name)
         )`,
        { count: 'exact' }
      );

    if (query.status) q = q.eq('status', query.status);
    // The triage default: everything still waiting on a human. A dispute the
    // merchant has answered is still open business — the platform has not
    // decided anything yet.
    if (query.openOnly) q = q.in('status', ['open', 'answered']);
    // Used by `disputeDetail` so one projection serves both the queue and the
    // detail page — see there.
    if (query.orderId) q = q.eq('order_id', query.orderId);

    const { data, count, error } = await q
      // Oldest first: a queue is worked from the front, and the dispute that
      // has waited longest is the one whose shopper has waited longest.
      .order('opened_at', { ascending: (query.dir ?? 'asc') === 'asc' })
      .order('order_id', { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw unexpectedDbError(error);

    return {
      // Flattened back to the shape the join produced, so the dashboard sees
      // no difference between this and what it was already reading.
      items: (data ?? []).map((r: any) => {
        const order = one(r.orders);
        const vendor = one(order?.vendors);
        return {
          orderId: r.orderId,
          reason: r.reason,
          message: r.message,
          status: r.status,
          openedAt: r.openedAt,
          merchantReply: r.merchantReply,
          answeredAt: r.answeredAt,
          resolvedAt: r.resolvedAt,
          orderTotalCad: Number(order?.orderTotalCad),
          orderStatus: order?.orderStatus,
          orderCreatedAt: order?.orderCreatedAt,
          refundedAt: order?.refundedAt ?? null,
          refundAmountCad: order?.refundAmountCad == null ? null : Number(order.refundAmountCad),
          customerName: order?.customerName ?? null,
          vendorName: vendor?.vendorName,
        };
      }),
      total: count ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * One dispute, keyed by its order.
   *
   * Deliberately the same projection `listDisputes` returns rather than a
   * richer one: the detail page and the queue row show the same facts, and two
   * shapes for one entity is how they drift. Anything more — the basket, the
   * delivery, the status trail — is already a `GET /admin/orders/:id` away, and
   * the page links there.
   */
  async disputeDetail(orderId: string) {
    const page = await this.listDisputes({ limit: 1, offset: 0, orderId });
    const [row] = page.items;
    if (!row) throw new NotFoundException('No dispute on this order');
    return row;
  }

  /**
   * Settle a dispute, optionally with money.
   *
   * The refund goes **first**, outside the status write: if Stripe refuses, the
   * dispute stays open and can be tried again, which is recoverable. A dispute
   * marked resolved-with-refund whose refund never happened is not — the
   * shopper has been told they were paid.
   */
  async resolveDispute(adminId: string, orderId: string, input: ResolveDisputeInput) {
    const dispute = await unwrap<{ orderId: string; status: string } | null>(
      this.db.from('disputes').select('orderId:order_id, status').eq('order_id', orderId).maybeSingle()
    );
    if (!dispute) throw new NotFoundException('No dispute on this order');
    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      throw new ConflictException(`This dispute is already ${dispute.status}`);
    }

    if (input.refundAmountCad !== undefined) {
      await this.refunds.refundOrder(adminId, orderId, {
        amountCad: input.refundAmountCad,
        reason: `Litige ${input.outcome}: ${input.note}`,
      });
    }

    // The status write and its audit entry land in one transaction, inside
    // `admin_resolve_dispute`. `AuditService.record` used to be handed the
    // caller's `tx` for exactly this reason: an audit entry for a change that
    // rolled back is a lie, and a change that committed without its entry is
    // the gap the table exists to close. There is no `tx` to pass over
    // PostgREST, so the pair moved into SQL together.
    await unwrapRpc<unknown>(
      this.db.rpc('admin_resolve_dispute', {
        p_admin_id: adminId,
        p_order_id: orderId,
        p_outcome: input.outcome,
        p_note: input.note,
        p_changes: {
          status: { from: dispute.status, to: input.outcome },
          // Recorded here as well as under `order.refund` above: the two are
          // separate decisions and a dispute read on its own should not have
          // to go looking for whether money moved.
          ...(input.refundAmountCad !== undefined
            ? { refundAmountCad: { from: null, to: input.refundAmountCad } }
            : {}),
        },
      }),
      (error) => {
        if (error.code === NOT_FOUND) throw new NotFoundException(error.message);
        throw unexpectedDbError(error);
      }
    );

    const [resolved] = await Promise.all([this.disputeFor(orderId), this.notify.disputeResolved(orderId)]);
    return resolved;
  }

  private async disputeFor(orderId: string) {
    const row = await unwrap<Record<string, unknown> | null>(
      this.db.from('disputes').select('*').eq('order_id', orderId).maybeSingle()
    );
    if (!row) throw new NotFoundException('No dispute on this order');
    return camelize(row);
  }

  // ── courier issues ────────────────────────────────────────────────────────

  /** Same projection as the queue, for the same reason as `disputeDetail`. */
  async courierIssueDetail(orderId: string) {
    const page = await this.listCourierIssues({ limit: 1, offset: 0, orderId });
    const [row] = page.items;
    if (!row) throw new NotFoundException('No courier issue on this order');
    return row;
  }

  async listCourierIssues(query: CourierIssueQuery): Promise<Page<unknown>> {
    // Same shape as `listDisputes`: the joins become embeds. `orders` and its
    // `vendors` are `!inner`; the delivery and its courier are not, because an
    // issue can be reported before a courier is assigned — a shop-not-ready
    // report can be filed before anyone accepts the run — and an issue screen
    // with no courier is still a valid one.
    let q = this.db
      .from('courier_issues')
      .select(
        `orderId:order_id, reason, message, status, at, resolvedAt:resolved_at,
         orders!inner(
           orderStatus:status,
           deliveryAddressStreet:delivery_address_street,
           deliveryAddressCity:delivery_address_city,
           vendors!inner(vendorName:name),
           order_deliveries(courierId:courier_id, couriers(courierName:full_name))
         )`,
        { count: 'exact' }
      );

    if (query.status) q = q.eq('status', query.status);
    if (query.orderId) q = q.eq('order_id', query.orderId);

    const { data, count, error } = await q
      .order('at', { ascending: (query.dir ?? 'asc') === 'asc' })
      .order('order_id', { ascending: true })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw unexpectedDbError(error);

    return {
      items: (data ?? []).map((r: any) => {
        const order = one<any>(r.orders);
        const vendor = one<any>(order?.vendors);
        const delivery = one<any>(order?.order_deliveries);
        const courier = one<any>(delivery?.couriers);
        return {
          orderId: r.orderId,
          reason: r.reason,
          message: r.message,
          status: r.status,
          at: r.at,
          resolvedAt: r.resolvedAt,
          orderStatus: order?.orderStatus,
          deliveryAddressStreet: order?.deliveryAddressStreet,
          deliveryAddressCity: order?.deliveryAddressCity,
          vendorName: vendor?.vendorName,
          // Joined through the delivery, since a courier issue is keyed by
          // order. Null when the report predates an assignment.
          courierId: delivery?.courierId ?? null,
          courierName: courier?.courierName ?? null,
        };
      }),
      total: count ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * Close a courier's report.
   *
   * Note what this deliberately does **not** do: it does not touch the order's
   * status. A courier standing outside a locked building still has someone's
   * dinner, and the order is not resolved until it is somewhere — the mock made
   * exactly this argument and it survives. Closing the report says a human dealt
   * with the courier, not that the delivery happened.
   */
  async resolveCourierIssue(adminId: string, orderId: string, input: ResolveCourierIssueInput) {
    // Same one-transaction guarantee as `resolveDispute`: the resolution and
    // its audit entry, or neither. The note is appended to the courier's own
    // message rather than replacing it — what they reported is evidence.
    const row = await unwrapRpc<Record<string, unknown>>(
      this.db.rpc('admin_resolve_courier_issue', {
        p_admin_id: adminId,
        p_order_id: orderId,
        p_note: input.note,
      }),
      (error) => {
        if (error.code === NOT_FOUND) throw new NotFoundException(error.message);
        throw unexpectedDbError(error);
      }
    );
    return camelize(row);
  }

  // ── supervision ───────────────────────────────────────────────────────────

  /**
   * The platform at a glance (CDC §04's "supervision générale").
   *
   * Counts only — the money view belongs to Phase 7's merchant analytics, which
   * has the commission model to compute against. What is here is what a
   * back-office landing page needs to decide where to look next: how much is
   * queued, and how much is stuck.
   */
  /**
   * One area's KPIs — the numbers above its list (`admin_insights`, `0044`).
   * The controller gates each area behind that area's own view permission.
   */
  async insights(area: InsightsArea): Promise<Record<string, unknown>> {
    return unwrap<Record<string, unknown>>(this.db.rpc('admin_insights', { p_area: area }));
  }

  async stats() {
    // Twelve scalar subqueries in one round trip. Rebuilt as PostgREST calls
    // this would be twelve requests, and the Montreal-midnight boundary in
    // `ordersToday` — which was a real over-count once — would have to be
    // recomputed client-side against a moving target. See `admin_stats`.
    //
    // Plus the support inbox's count, read here rather than added to the SQL
    // function: one cheap indexed count beside it, no migration to the
    // function's body. Escalated means a customer handed the thread to the team.
    const [stats, supportWaiting] = await Promise.all([
      unwrap<Record<string, number>>(this.db.rpc('admin_stats')),
      this.db
        .from('support_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'escalated')
        .then(({ count, error }) => {
          if (error) throw unexpectedDbError(error);
          return count ?? 0;
        }),
    ]);
    return { ...stats, supportWaiting };
  }

  /**
   * Orders, unscoped — the back office sees every shop.
   *
   * ⚠️ **Breaking change, 2026-09-03.** This was `recentOrders()`, returning a
   * bare array with `totalCad` as the raw `numeric` string. It now returns the
   * same `Page<T>` envelope every other list on this controller returns, with
   * money as numbers. Two reasons it was worth breaking:
   *
   *   - A bare array carries no `total`, so a paginated table cannot render a
   *     page count. Every other admin list already had one; leaving this the
   *     exception guaranteed someone would special-case it badly.
   *   - `totalCad` as a string is a live bug, not a style preference — a
   *     column the dashboard sorts on collates as text, putting `$9.00` above
   *     `$85.00`.
   *
   * Safe to break because the only consumer is the admin dashboard, which was
   * still running entirely on its own localStorage mock and had never called
   * this route. Deliberately no `?envelope=false` escape hatch: it would be
   * permanent.
   */
  async listOrders(query: OrderListQuery): Promise<Page<AdminOrderListItem>> {
    // An RPC because the filter spans a joined table (`vendors.name`) and
    // prefix-matches the order id as text — PostgREST's `.or()` reaches
    // neither. Escaping stays here: `containsPattern` is what stops a literal
    // `%` matching the whole table.
    const pattern = query.search ? containsPattern(query.search) : null;
    const idPrefix = query.search ? escapeLikePattern(query.search.toLowerCase()) + '%' : null;

    const page = await unwrap<{ items: AdminOrderListItem[]; total: number }>(
      this.db.rpc('admin_list_orders', {
        p_status: query.status ?? undefined,
        p_vendor_id: query.vendorId ?? undefined,
        p_search: pattern ?? undefined,
        p_id_prefix: idPrefix ?? undefined,
        p_limit: query.limit,
        p_offset: query.offset,
        p_sort: query.sort,
        p_dir: query.dir,
      })
    );

    return { items: page.items, total: page.total, limit: query.limit, offset: query.offset };
  }

  /**
   * The back office's typeahead, across shops, couriers, orders and accounts.
   *
   * Returns a **bare array**, not a `Page<T>` — a typeahead has no pagination,
   * and the envelope would be three fields of noise. This is the one endpoint
   * here where that is right.
   *
   * Result order is vendors, couriers, orders, users, so a grouped renderer
   * needs no sort of its own.
   */
  async search(query: AdminSearchQuery): Promise<AdminSearchResult[]> {
    // Mandatory, and this is the endpoint most likely to receive a literal `%`:
    // a bare `%${q}%` would match every row in all four tables.
    const pattern = containsPattern(query.q);
    // An id fragment is prefix-matched — that is what a paste of the truncated
    // id the UI displays looks like, and a prefix is the only id match an index
    // can serve. `ilike '%…%'` on a uuid cast to text is a guaranteed full scan.
    const idPrefix = looksLikeIdFragment(query.q) ? escapeLikePattern(query.q.toLowerCase()) + '%' : null;

    // ⚠️ SECURITY DEFINER, because the account branch reads `auth.users` and
    // only `postgres` holds SELECT there — the old Drizzle connection was
    // `postgres` and this one is `service_role`. See the migration.
    return unwrap<AdminSearchResult[]>(
      this.db.rpc('admin_search', {
        p_pattern: pattern,
        p_id_prefix: idPrefix ?? undefined,
        p_per_type: query.perType,
      })
    );
  }

  /**
   * The dashboard's landing page: money, momentum, and the queues, for a
   * chosen window.
   *
   * Cancelled orders are excluded from every metric here — they represent no
   * business having happened, and counting them would flatter every figure.
   * Refunded ones are counted at full value, with `refundedCad` reported
   * alongside; see `AdminOverviewStats`.
   */
  async overview(range: OverviewRange): Promise<AdminOverviewStats> {
    // `overviewWindow` stays the authority on what "the last N days" means in
    // Montreal; the SQL is handed the bounds rather than recomputing them, so
    // there is one calendar rather than two.
    const window = overviewWindow(range, new Date());
    const { curStart, curEnd, prevStart, days } = window;

    // One call. The aggregate is `filter (where …)` over two windows, a
    // `generate_series` LEFT JOIN and a group-by ordered on a sum — none of
    // which PostgREST can express, and which as separate requests would be a
    // dozen round trips for one landing page.
    const raw = await unwrap<{
      totals: Record<string, number> | null;
      series: { date: string; gmv: number; orders: number }[];
      topVendors: { vendorId: string; name: string; vendorType: string; revenueCad: number; orderCount: number }[];
      byVertical: Record<string, number>;
      queues: Record<string, number>;
    }>(
      this.db.rpc('admin_overview', {
        p_cur_start: curStart.toISOString(),
        p_cur_end: curEnd.toISOString(),
        p_prev_start: prevStart.toISOString(),
        p_day_from: days[0],
        p_day_to: days[days.length - 1],
      })
    );

    const t = raw.totals ?? {};
    const gmvCad = t.gmvCad ?? 0;
    const orderCount = t.orderCount ?? 0;
    const seriesRows = raw.series ?? [];

    // A silent off-by-one here would misalign every bar with its label, so it
    // is asserted rather than hoped for. `generate_series` over `::date` is
    // DST-immune; over `timestamptz` it is not, which is why the cast matters.
    if (seriesRows.length !== range) {
      throw new Error(`Overview series returned ${seriesRows.length} buckets for a ${range}-day range`);
    }

    return {
      range,
      from: curStart.toISOString(),
      to: curEnd.toISOString(),

      gmvCad,
      gmvDeltaPct: deltaPct(gmvCad, t.prevGmvCad ?? 0),
      orderCount,
      orderDeltaPct: deltaPct(orderCount, t.prevOrderCount ?? 0),
      commissionRevenueCad: t.commissionRevenueCad ?? 0,
      refundedCad: t.refundedCad ?? 0,
      averageOrderValueCad: orderCount === 0 ? 0 : round2(gmvCad / orderCount),

      series: seriesRows,
      topVendors: raw.topVendors ?? [],
      // Both verticals always present, backfilled with 0 — otherwise the chart
      // grows and shrinks a category as the range changes.
      ordersByVertical: (['grocery', 'restaurant'] as const).map((vertical) => ({
        vertical,
        orders: raw.byVertical?.[vertical] ?? 0,
      })),

      queues: raw.queues,
    } as AdminOverviewStats;
  }

  /**
   * One order, whole — the arbitration view. Everything a human needs to decide
   * a dispute without opening a second screen: what was bought, what was
   * charged, who carried it, and what each party has said.
   *
   * Uses Drizzle's **relational** query builder (`db.query.*`) rather than the
   * explicit `.select()` builder the rest of this file uses. That is
   * deliberate, and it is the one place here it earns the inconsistency: six
   * hand-written left joins would fan the item rows against the status-history
   * rows into a cartesian product that then has to be de-duplicated in TS —
   * exactly the bug the relational builder exists to prevent. `createDbClient`
   * already passes `{ schema }` to `drizzle()`, so the relations are available.
   */
  async orderDetail(id: string): Promise<AdminOrderDetail> {
    // PostgREST embeds are the direct equivalent of the relational builder's
    // `with`, and they solve the same problem it was chosen for: six hand-written
    // left joins would fan the item rows against the status-history rows into a
    // cartesian product needing de-duplication in TS.
    const fetched = await unwrap<any>(
      this.db
        .from('orders')
        .select(
          `*,
           vendor:vendors!inner(id, name, slug, vendorType:vendor_type, city,
                                addressStreet:address_street, addressPostalCode:address_postal_code),
           customer:profiles(id, fullName:full_name, avatarUrl:avatar_url, memberSince:member_since),
           items:order_items(*),
           statusHistory:order_status_history(status, at),
           dispute:disputes(*),
           courierIssue:courier_issues(*),
           delivery:order_deliveries(*,
             courier:couriers(id, fullName:full_name, phone, vehicle),
             proof:delivery_proofs(*))`
        )
        .eq('id', id)
        // A timeline read backwards is not a timeline.
        .order('at', { referencedTable: 'order_status_history', ascending: true })
        .maybeSingle()
    );

    if (!fetched) throw new NotFoundException('Order not found');
    const row = camelize<any>(fetched);
    // PostgREST decides an embed's cardinality from the schema's constraints,
    // so a 1:1 relation may arrive as an object or a one-element array — see
    // `db/embed.ts`.
    const customer = one<any>(row.customer);
    const vendor = one<any>(row.vendor);
    const dispute = one<any>(row.dispute);
    const courierIssue = one<any>(row.courierIssue);
    const delivery = one<any>(row.delivery);

    return {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      stripePaymentIntentId: row.stripePaymentIntentId,

      customer: customer ?? null,
      customerName: row.customerName,

      vendor: vendor,

      items: (row.items ?? []).map((item: any) => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        unitPriceCad: num(item.unitPriceCad),
        // Computed here so every reader agrees: the client multiplying a
        // string price by a quantity is how a receipt starts disagreeing with
        // its own total.
        lineTotalCad: Math.round(num(item.unitPriceCad) * item.qty * 100) / 100,
      })),

      totals: {
        subtotalCad: num(row.subtotalCad),
        gstCad: num(row.gstCad),
        qstCad: num(row.qstCad),
        deliveryFeeCad: num(row.deliveryFeeCad),
        pointsRedeemed: row.pointsRedeemed,
        pointsDiscountCad: numOrNull(row.pointsDiscountCad),
        couponCode: row.couponCode,
        couponDiscountCad: numOrNull(row.couponDiscountCad),
        totalCad: num(row.totalCad),
      },

      // Null rather than a zeroed object: "never refunded" and "refunded $0"
      // are different facts and the UI renders them differently.
      refund:
        row.refundedAt === null
          ? null
          : {
              refundedAt: row.refundedAt,
              refundAmountCad: numOrNull(row.refundAmountCad),
              stripeRefundId: row.stripeRefundId,
              refundReason: row.refundReason,
            },

      deliveryAddress: {
        label: row.deliveryAddressLabel,
        street: row.deliveryAddressStreet,
        city: row.deliveryAddressCity,
        postalCode: row.deliveryAddressPostalCode,
        lat: row.deliveryAddressLat,
        lng: row.deliveryAddressLng,
      },

      // The back office sees all of it, door code included: it is what a
      // courier stuck outside a building calls support about.
      deliveryInstructions: {
        unit: row.deliveryUnit ?? null,
        doorCode: row.deliveryDoorCode ?? null,
        notes: row.deliveryNotes ?? null,
        dropoff: row.deliveryDropoff ?? 'hand',
      },

      statusHistory: (row.statusHistory ?? []).map((h: any) => ({ status: h.status, at: h.at })),

      delivery: delivery
        ? {
            courier: one<any>(delivery.courier) ?? null,
            acceptedAt: delivery.acceptedAt,
            pickedUpAt: delivery.pickedUpAt,
            deliveredAt: delivery.deliveredAt,
            pickupEtaMin: delivery.pickupEtaMin,
            dropoffEtaMin: delivery.dropoffEtaMin,
            distanceKm: num(delivery.distanceKm),
            tipCad: num(delivery.tipCad),
            earningsCad: num(delivery.earningsCad),
            paidOutAt: delivery.paidOutAt,
            proof: one<any>(delivery.proof)
              ? {
                  method: one<any>(delivery.proof).method,
                  imagePath: one<any>(delivery.proof).imagePath,
                  note: one<any>(delivery.proof).note,
                  at: one<any>(delivery.proof).at,
                }
              : null,
            // `pin` is intentionally dropped here — see AdminOrderDetail.
          }
        : null,

      dispute: dispute
        ? {
            reason: dispute.reason,
            message: dispute.message,
            openedAt: dispute.openedAt,
            status: dispute.status,
            merchantReply: dispute.merchantReply,
            answeredAt: dispute.answeredAt,
            resolvedAt: dispute.resolvedAt,
          }
        : null,

      courierIssue: courierIssue
        ? {
            reason: courierIssue.reason,
            message: courierIssue.message,
            at: courierIssue.at,
            status: courierIssue.status,
            resolvedAt: courierIssue.resolvedAt,
          }
        : null,
    };
  }
}

/** `admin_resolve_dispute` / `admin_resolve_courier_issue` raise this when nothing matched. */
const NOT_FOUND = 'SGB05';

/**
 * ⚠️ Never let `error.message` reach the client: PostgREST echoes constraint
 * names, columns and sometimes offending values. The detail goes to the log.
 */
function unexpectedDbError(error: PostgrestError): Error {
  console.error('[postgrest]', error.code, error.message, error.details ?? '', error.hint ?? '');
  return new InternalServerErrorException('Database request failed');
}
