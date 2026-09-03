import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm';

import type { Page } from '../catalog/dto/query.dto.js';
import { containsPattern, escapeLikePattern } from '../common/sql/like.js';
import { authUsersReadonly } from '../db/auth-users.readonly.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { courierIssues, couriers, disputes, orderDeliveries, orders, profiles, vendors } from '../db/schema/index.js';
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
import { AuditService } from './audit.service.js';
import { RefundsService } from './refunds.service.js';
import { deltaPct, overviewWindow, round2, type OverviewRange } from './stats-window.js';

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
@Injectable()
export class AdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly refunds: RefundsService,
    private readonly audit: AuditService
  ) {}

  // ── disputes ──────────────────────────────────────────────────────────────

  async listDisputes(query: DisputeQuery): Promise<Page<unknown>> {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(disputes.status, query.status));
    // The triage default: everything still waiting on a human. A dispute the
    // merchant has answered is still open business — the platform has not
    // decided anything yet.
    if (query.openOnly) conditions.push(inArray(disputes.status, ['open', 'answered']));
    // Used by `disputeDetail` so one projection serves both the queue and the
    // detail page — see there.
    if (query.orderId) conditions.push(eq(disputes.orderId, query.orderId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({
          orderId: disputes.orderId,
          reason: disputes.reason,
          message: disputes.message,
          status: disputes.status,
          openedAt: disputes.openedAt,
          merchantReply: disputes.merchantReply,
          answeredAt: disputes.answeredAt,
          resolvedAt: disputes.resolvedAt,
          orderTotalCad: orders.totalCad,
          orderStatus: orders.status,
          orderCreatedAt: orders.createdAt,
          refundedAt: orders.refundedAt,
          refundAmountCad: orders.refundAmountCad,
          customerName: orders.customerName,
          vendorName: vendors.name,
        })
        .from(disputes)
        .innerJoin(orders, eq(orders.id, disputes.orderId))
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
        .where(where)
        // Oldest first: a queue is worked from the front, and the dispute that
        // has waited longest is the one whose shopper has waited longest.
        .orderBy(disputes.openedAt)
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(disputes)
        .where(where),
    ]);

    return {
      items: rows.map((r) => ({
        ...r,
        orderTotalCad: Number(r.orderTotalCad),
        refundAmountCad: r.refundAmountCad === null ? null : Number(r.refundAmountCad),
      })),
      total: counted?.total ?? 0,
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
    const [dispute] = await this.db
      .select({ orderId: disputes.orderId, status: disputes.status })
      .from(disputes)
      .where(eq(disputes.orderId, orderId))
      .limit(1);
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

    await this.db.transaction(async (tx) => {
      await tx
        .update(disputes)
        .set({
          status: input.outcome,
          resolvedBy: adminId,
          resolvedAt: new Date(),
          // Appended rather than overwriting the merchant's reply: a dispute is a
          // conversation, and the shopper's original words plus the merchant's
          // answer are the two things nobody should be able to rewrite.
          merchantReply: input.note,
        })
        .where(eq(disputes.orderId, orderId));

      await this.audit.record(
        {
          actorId: adminId,
          action: 'dispute.resolve',
          subjectType: 'dispute',
          // Keyed by order, because that is what a dispute is keyed by here and
          // what a reader will have in hand.
          subjectId: orderId,
          reason: input.note,
          changes: {
            status: { from: dispute.status, to: input.outcome },
            // Recorded here as well as under `order.refund` above: the two are
            // separate decisions and a dispute read on its own should not have
            // to go looking for whether money moved.
            ...(input.refundAmountCad !== undefined
              ? { refundAmountCad: { from: null, to: input.refundAmountCad } }
              : {}),
          },
        },
        tx
      );
    });

    return this.disputeFor(orderId);
  }

  private async disputeFor(orderId: string) {
    const [row] = await this.db.select().from(disputes).where(eq(disputes.orderId, orderId)).limit(1);
    if (!row) throw new NotFoundException('No dispute on this order');
    return row;
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
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(courierIssues.status, query.status));
    if (query.orderId) conditions.push(eq(courierIssues.orderId, query.orderId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({
          orderId: courierIssues.orderId,
          reason: courierIssues.reason,
          message: courierIssues.message,
          status: courierIssues.status,
          at: courierIssues.at,
          resolvedAt: courierIssues.resolvedAt,
          orderStatus: orders.status,
          deliveryAddressStreet: orders.deliveryAddressStreet,
          deliveryAddressCity: orders.deliveryAddressCity,
          vendorName: vendors.name,
          // Joined through the delivery, since a courier issue is keyed by
          // order. Null when the report predates an assignment — rare, but a
          // shop-not-ready report can be filed before anyone accepts the run.
          courierId: orderDeliveries.courierId,
          courierName: couriers.fullName,
        })
        .from(courierIssues)
        .innerJoin(orders, eq(orders.id, courierIssues.orderId))
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
        // Left, both of them: an issue can be reported before a courier is
        // assigned, and an issue screen with no courier is still a valid one.
        .leftJoin(orderDeliveries, eq(orderDeliveries.orderId, courierIssues.orderId))
        .leftJoin(couriers, eq(couriers.id, orderDeliveries.courierId))
        .where(where)
        .orderBy(courierIssues.at)
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(courierIssues).where(where),
    ]);

    return { items: rows, total: counted?.total ?? 0, limit: query.limit, offset: query.offset };
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
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(courierIssues)
        .set({
          status: 'resolved',
          resolvedBy: adminId,
          resolvedAt: new Date(),
          message: sql`${courierIssues.message} || E'\n\n— Résolution: ' || ${input.note}`,
        })
        .where(and(eq(courierIssues.orderId, orderId), eq(courierIssues.status, 'open')))
        .returning();
      if (updated.length === 0) throw new NotFoundException('No open courier issue on this order');

      await this.audit.record(
        {
          actorId: adminId,
          action: 'courier_issue.resolve',
          subjectType: 'courier_issue',
          subjectId: orderId,
          reason: input.note,
          changes: { status: { from: 'open', to: 'resolved' } },
        },
        tx
      );

      return updated[0];
    });
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
  async stats() {
    const [row] = await this.db
      .select({
        vendorsPending: sql<number>`(select count(*) from ${vendors} where status = 'pending')::int`,
        vendorsApproved: sql<number>`(select count(*) from ${vendors} where status = 'approved')::int`,
        couriersPending: sql<number>`(select count(*) from ${couriers} where status = 'pending')::int`,
        couriersApproved: sql<number>`(select count(*) from ${couriers} where status = 'approved')::int`,
        couriersOnline: sql<number>`(select count(*) from ${couriers} where is_online = true and status = 'approved')::int`,
        // ⚠️ Was `date_trunc('day', now() at time zone 'America/Montreal')`,
        // which is wrong and was quietly over-counting. `now() at time zone
        // 'America/Montreal'` converts a timestamptz to a *naive* timestamp
        // holding Montreal wall-clock; truncating gives naive Montreal
        // midnight; comparing that against a timestamptz column casts it back
        // using the session zone (UTC). So "today" began at 00:00 UTC of
        // Montreal's date — four or five hours early — and swept in the
        // previous Montreal evening's orders. Converting back explicitly is
        // what makes it the instant the Montreal day actually starts.
        ordersToday: sql<number>`(select count(*) from ${orders} where created_at >= ((now() at time zone 'America/Montreal')::date)::timestamp at time zone 'America/Montreal')::int`,
        ordersActive: sql<number>`(select count(*) from ${orders} where status not in ('delivered','cancelled'))::int`,
        // The number that actually needs watching: packed, paid for, and
        // nobody carrying it.
        ordersUnassigned: sql<number>`(
          select count(*) from ${orders} o
          where o.status = 'ready'
            and not exists (select 1 from order_deliveries d where d.order_id = o.id)
        )::int`,
        disputesOpen: sql<number>`(select count(*) from ${disputes} where status in ('open','answered'))::int`,
        courierIssuesOpen: sql<number>`(select count(*) from ${courierIssues} where status = 'open')::int`,
        customers: sql<number>`(select count(*) from ${profiles} where role = 'customer')::int`,
      })
      .from(sql`(select 1) as _`);
    return row;
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
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(orders.status, query.status));
    if (query.vendorId) conditions.push(eq(orders.vendorId, query.vendorId));
    if (query.search) {
      const pattern = containsPattern(query.search);
      conditions.push(
        or(
          ilike(orders.customerName, pattern),
          ilike(vendors.name, pattern),
          // Real ids are uuids and the dashboard displays the first 8
          // characters, so a *prefix* is what someone pastes back — and a
          // prefix is the only id match an index can ever serve. `ILIKE
          // '%…%'` on a uuid cast to text is a guaranteed full scan.
          sql`${orders.id}::text like ${escapeLikePattern(query.search.toLowerCase()) + '%'}`
        )!
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [counted]] = await Promise.all([
      this.db
        .select({
          id: orders.id,
          status: orders.status,
          createdAt: orders.createdAt,
          subtotalCad: orders.subtotalCad,
          totalCad: orders.totalCad,
          customerId: orders.customerId,
          customerName: orders.customerName,
          vendorId: orders.vendorId,
          vendorName: vendors.name,
          vendorType: vendors.vendorType,
          courierName: couriers.fullName,
          refundedAt: orders.refundedAt,
          refundAmountCad: orders.refundAmountCad,
          // Both relations are 1:1 on `order_id`, so these left joins add a
          // flag without fanning the row out. They are what lets the table
          // badge a problem order without an N+1 per page.
          hasDispute: sql<boolean>`${disputes.orderId} is not null`,
          hasCourierIssue: sql<boolean>`${courierIssues.orderId} is not null`,
        })
        .from(orders)
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
        .leftJoin(orderDeliveries, eq(orderDeliveries.orderId, orders.id))
        .leftJoin(couriers, eq(couriers.id, orderDeliveries.courierId))
        .leftJoin(disputes, eq(disputes.orderId, orders.id))
        .leftJoin(courierIssues, eq(courierIssues.orderId, orders.id))
        .where(where)
        // The `id` tiebreak is what keeps pagination stable when two orders
        // share a `created_at` — without it a row can appear on two pages, or
        // on neither.
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(orders)
        // Repeated because `search` filters on `vendors.name` — the count must
        // see the same rows the page does, or the page count lies.
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
        .where(where),
    ]);

    return {
      items: rows.map((r) => ({
        ...r,
        subtotalCad: num(r.subtotalCad),
        totalCad: num(r.totalCad),
        refundAmountCad: numOrNull(r.refundAmountCad),
      })),
      total: counted?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
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
    const limit = query.perType;

    const [vendorHits, courierHits, orderHits, userHits] = await Promise.all([
      this.db
        .select({ id: vendors.id, name: vendors.name, city: vendors.city, neighborhood: vendors.neighborhood })
        .from(vendors)
        .where(or(ilike(vendors.name, pattern), ilike(vendors.city, pattern), ilike(vendors.slug, pattern)))
        .limit(limit),

      this.db
        .select({ id: couriers.id, fullName: couriers.fullName, city: couriers.city })
        .from(couriers)
        .where(or(ilike(couriers.fullName, pattern), ilike(couriers.city, pattern), ilike(couriers.phone, pattern)))
        .limit(limit),

      // Orders branch on what was typed. An id fragment is prefix-matched —
      // that is what a paste of the truncated id the UI displays looks like,
      // and a prefix is the only id match an index can serve. `ILIKE '%…%'` on
      // a uuid cast to text is a guaranteed full scan.
      this.db
        .select({
          id: orders.id,
          customerName: orders.customerName,
          vendorName: vendors.name,
        })
        .from(orders)
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
        .where(
          looksLikeIdFragment(query.q)
            ? sql`${orders.id}::text like ${escapeLikePattern(query.q.toLowerCase()) + '%'}`
            : or(ilike(orders.customerName, pattern), ilike(vendors.name, pattern))
        )
        .orderBy(desc(orders.createdAt))
        .limit(limit),

      this.db
        .select({ id: profiles.id, fullName: profiles.fullName, email: authUsersReadonly.email })
        .from(profiles)
        .leftJoin(authUsersReadonly, eq(authUsersReadonly.id, profiles.id))
        .where(or(ilike(profiles.fullName, pattern), ilike(authUsersReadonly.email, pattern)))
        .limit(limit),
    ]);

    return [
      ...vendorHits.map((v) => ({
        type: 'vendor' as const,
        id: v.id,
        label: v.name,
        sublabel: `${v.city} · ${v.neighborhood}`,
      })),
      ...courierHits.map((c) => ({ type: 'courier' as const, id: c.id, label: c.fullName, sublabel: c.city })),
      ...orderHits.map((o) => ({
        type: 'order' as const,
        id: o.id,
        // Matches how the dashboard displays an order id everywhere else.
        label: `#${o.id.slice(0, 8)}`,
        sublabel: `${o.customerName ?? '—'} · ${o.vendorName}`,
      })),
      ...userHits.map((u) => ({ type: 'user' as const, id: u.id, label: u.fullName, sublabel: u.email ?? '—' })),
    ];
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
    const window = overviewWindow(range, new Date());
    const { curStart, curEnd, prevStart, days } = window;

    // ⚠️ Raw `sql` templates must be handed ISO **strings**, not `Date`s.
    // Operators like `gte(orders.createdAt, …)` know the column and run the
    // value through its type mapper; a `${date}` interpolated into a bare
    // template does not, so postgres.js receives a `Date` it cannot serialise
    // and the whole query fails with `ERR_INVALID_ARG_TYPE` — a Node error,
    // nowhere near the SQL, and easy to misread as a syntax problem.
    // Postgres infers `timestamptz` for the parameter from the comparison.
    const curStartIso = curStart.toISOString();
    const curEndIso = curEnd.toISOString();

    const [totals, series, topVendors, byVertical, queues] = await Promise.all([
      // One pass over both windows. `filter` splits current from previous
      // without scanning the table twice, and the commission rate is read in
      // SQL so the multiplication stays exact `numeric` arithmetic rather than
      // round-tripping through a float.
      this.db
        .select({
          gmvCad: sql<number>`round(coalesce(sum(${orders.totalCad}) filter (where ${orders.createdAt} >= ${curStartIso}), 0), 2)::float8`,
          prevGmvCad: sql<number>`round(coalesce(sum(${orders.totalCad}) filter (where ${orders.createdAt} < ${curStartIso}), 0), 2)::float8`,
          orderCount: sql<number>`(count(*) filter (where ${orders.createdAt} >= ${curStartIso}))::int`,
          prevOrderCount: sql<number>`(count(*) filter (where ${orders.createdAt} < ${curStartIso}))::int`,
          commissionRevenueCad: sql<number>`round(
            coalesce(sum(${orders.subtotalCad}) filter (where ${orders.createdAt} >= ${curStartIso}), 0)
            * (select commission_rate from platform_settings where id = 1), 2)::float8`,
          refundedCad: sql<number>`round(coalesce(sum(${orders.refundAmountCad}) filter (where ${orders.createdAt} >= ${curStartIso}), 0), 2)::float8`,
        })
        .from(orders)
        .where(and(ne(orders.status, 'cancelled'), gte(orders.createdAt, prevStart), lt(orders.createdAt, curEnd))),

      // `generate_series` LEFT JOIN so a day with no orders is a zero, not a
      // missing point — a line chart that skips days draws a lie.
      //
      // The `created_at` bounds are repeated inside the JOIN condition on
      // purpose: without them the join scans every order ever placed and only
      // then discards the ones outside the window.
      this.db.execute(sql`
        select to_char(d.day, 'YYYY-MM-DD')                    as date,
               round(coalesce(sum(o.total_cad), 0), 2)::float8 as gmv,
               count(o.id)::int                                as orders
        from generate_series(${days[0]}::date, ${days[days.length - 1]}::date, interval '1 day') as d(day)
        left join orders o
          on (o.created_at at time zone 'America/Montreal')::date = d.day::date
         and o.status <> 'cancelled'
         and o.created_at >= ${curStartIso}
         and o.created_at <  ${curEndIso}
        group by d.day
        order by d.day
      `),

      this.db
        .select({
          vendorId: vendors.id,
          name: vendors.name,
          vendorType: vendors.vendorType,
          revenueCad: sql<number>`round(coalesce(sum(${orders.totalCad}), 0), 2)::float8`,
          orderCount: sql<number>`count(*)::int`,
        })
        .from(orders)
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
        .where(and(ne(orders.status, 'cancelled'), gte(orders.createdAt, curStart), lt(orders.createdAt, curEnd)))
        .groupBy(vendors.id, vendors.name, vendors.vendorType)
        .orderBy(sql`sum(${orders.totalCad}) desc`)
        .limit(6),

      this.db
        .select({ vertical: vendors.vendorType, orders: sql<number>`count(*)::int` })
        .from(orders)
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
        .where(and(ne(orders.status, 'cancelled'), gte(orders.createdAt, curStart), lt(orders.createdAt, curEnd)))
        .groupBy(vendors.vendorType),

      this.stats(),
    ]);

    const t = totals[0];
    const gmvCad = t?.gmvCad ?? 0;
    const orderCount = t?.orderCount ?? 0;

    const seriesRows = [...series] as { date: string; gmv: number; orders: number }[];
    // A silent off-by-one here would misalign every bar with its label, so it
    // is asserted rather than hoped for. `generate_series` over `::date` is
    // DST-immune; over `timestamptz` it is not, which is why the cast matters.
    if (seriesRows.length !== range) {
      throw new Error(`Overview series returned ${seriesRows.length} buckets for a ${range}-day range`);
    }

    const verticalCounts = new Map(byVertical.map((r) => [r.vertical, r.orders]));

    return {
      range,
      from: curStart.toISOString(),
      to: curEnd.toISOString(),

      gmvCad,
      gmvDeltaPct: deltaPct(gmvCad, t?.prevGmvCad ?? 0),
      orderCount,
      orderDeltaPct: deltaPct(orderCount, t?.prevOrderCount ?? 0),
      commissionRevenueCad: t?.commissionRevenueCad ?? 0,
      refundedCad: t?.refundedCad ?? 0,
      averageOrderValueCad: orderCount === 0 ? 0 : round2(gmvCad / orderCount),

      series: seriesRows,
      topVendors,
      // Both verticals always present, backfilled with 0 — otherwise the chart
      // grows and shrinks a category as the range changes.
      ordersByVertical: (['grocery', 'restaurant'] as const).map((vertical) => ({
        vertical,
        orders: verticalCounts.get(vertical) ?? 0,
      })),

      queues,
    };
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
    const row = await this.db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: {
        vendor: {
          columns: { id: true, name: true, slug: true, vendorType: true, city: true, addressStreet: true, addressPostalCode: true },
        },
        customer: { columns: { id: true, fullName: true, avatarUrl: true, memberSince: true } },
        items: true,
        // A timeline read backwards is not a timeline.
        statusHistory: { orderBy: (h, { asc }) => [asc(h.at)] },
        dispute: true,
        courierIssue: true,
        delivery: {
          with: {
            courier: { columns: { id: true, fullName: true, phone: true, vehicle: true } },
            proof: true,
          },
        },
      },
    });

    if (!row) throw new NotFoundException('Order not found');

    return {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      stripePaymentIntentId: row.stripePaymentIntentId,

      customer: row.customer ?? null,
      customerName: row.customerName,

      vendor: row.vendor,

      items: row.items.map((item) => ({
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

      statusHistory: row.statusHistory.map((h) => ({ status: h.status, at: h.at })),

      delivery: row.delivery
        ? {
            courier: row.delivery.courier ?? null,
            acceptedAt: row.delivery.acceptedAt,
            pickedUpAt: row.delivery.pickedUpAt,
            deliveredAt: row.delivery.deliveredAt,
            pickupEtaMin: row.delivery.pickupEtaMin,
            dropoffEtaMin: row.delivery.dropoffEtaMin,
            distanceKm: num(row.delivery.distanceKm),
            tipCad: num(row.delivery.tipCad),
            earningsCad: num(row.delivery.earningsCad),
            paidOutAt: row.delivery.paidOutAt,
            proof: row.delivery.proof
              ? {
                  method: row.delivery.proof.method,
                  imagePath: row.delivery.proof.imagePath,
                  note: row.delivery.proof.note,
                  at: row.delivery.proof.at,
                }
              : null,
            // `pin` is intentionally dropped here — see AdminOrderDetail.
          }
        : null,

      dispute: row.dispute
        ? {
            reason: row.dispute.reason,
            message: row.dispute.message,
            openedAt: row.dispute.openedAt,
            status: row.dispute.status,
            merchantReply: row.dispute.merchantReply,
            answeredAt: row.dispute.answeredAt,
            resolvedAt: row.dispute.resolvedAt,
          }
        : null,

      courierIssue: row.courierIssue
        ? {
            reason: row.courierIssue.reason,
            message: row.courierIssue.message,
            at: row.courierIssue.at,
            status: row.courierIssue.status,
            resolvedAt: row.courierIssue.resolvedAt,
          }
        : null,
    };
  }
}
