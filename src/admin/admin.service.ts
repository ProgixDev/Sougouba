import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';

import type { Page } from '../catalog/dto/query.dto.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { courierIssues, couriers, disputes, orders, profiles, vendors } from '../db/schema/index.js';
import type {
  CourierIssueQuery,
  DisputeQuery,
  ResolveCourierIssueInput,
  ResolveDisputeInput,
} from './dto/admin.dto.js';
import { RefundsService } from './refunds.service.js';

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
    private readonly refunds: RefundsService
  ) {}

  // ── disputes ──────────────────────────────────────────────────────────────

  async listDisputes(query: DisputeQuery): Promise<Page<unknown>> {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(disputes.status, query.status));
    // The triage default: everything still waiting on a human. A dispute the
    // merchant has answered is still open business — the platform has not
    // decided anything yet.
    if (query.openOnly) conditions.push(inArray(disputes.status, ['open', 'answered']));
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

    await this.db
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

    return this.disputeFor(orderId);
  }

  private async disputeFor(orderId: string) {
    const [row] = await this.db.select().from(disputes).where(eq(disputes.orderId, orderId)).limit(1);
    if (!row) throw new NotFoundException('No dispute on this order');
    return row;
  }

  // ── courier issues ────────────────────────────────────────────────────────

  async listCourierIssues(query: CourierIssueQuery): Promise<Page<unknown>> {
    const where = query.status ? eq(courierIssues.status, query.status) : undefined;

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
        })
        .from(courierIssues)
        .innerJoin(orders, eq(orders.id, courierIssues.orderId))
        .innerJoin(vendors, eq(vendors.id, orders.vendorId))
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
    const updated = await this.db
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
    return updated[0];
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
        ordersToday: sql<number>`(select count(*) from ${orders} where created_at >= date_trunc('day', now() at time zone 'America/Montreal'))::int`,
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

  /** Recent orders, unscoped — the back office sees every shop. */
  async recentOrders(limit: number, offset: number) {
    return this.db
      .select({
        id: orders.id,
        status: orders.status,
        totalCad: orders.totalCad,
        createdAt: orders.createdAt,
        customerName: orders.customerName,
        vendorName: vendors.name,
        refundedAt: orders.refundedAt,
      })
      .from(orders)
      .innerJoin(vendors, eq(vendors.id, orders.vendorId))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit)
      .offset(offset);
  }
}
