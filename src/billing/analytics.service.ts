import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { orderItems, orders, vendors } from '../db/schema/index.js';
import { SettingsService } from '../loyalty/settings.service.js';

/**
 * What a merchant's dashboard shows — the SQL port of `lib/analytics.ts`'s
 * `summariseOrders`, which reduces over every order the phone has fetched.
 *
 * **Revenue is the product subtotal, not the order total**, and this is the one
 * figure worth being loud about. The mobile app's own comment explains why it
 * changed: `totalCad` was already generous (the delivery fee pays the delivery,
 * not the shop) and became plainly wrong once orders carried TPS and TVQ —
 * money the merchant collects on the government's behalf and does not keep. A
 * dashboard counting it as "Recettes" tells a merchant they earned about 20 %
 * more than they did.
 *
 * Cancelled orders are excluded from revenue but still counted in
 * `statusCounts`: a shop needs to see its cancellation rate, but cancelled
 * money was never earned.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly settings: SettingsService
  ) {}

  private async vendorIdFor(userId: string): Promise<string> {
    const [row] = await this.db.select({ id: vendors.id }).from(vendors).where(eq(vendors.ownerId, userId)).limit(1);
    if (!row) throw new NotFoundException('This account has no shop');
    return row.id;
  }

  async forOwner(userId: string, days: number) {
    const vendorId = await this.vendorIdFor(userId);
    const rates = await this.settings.all();

    // The window starts at midnight `days-1` days ago, in **Montreal time**.
    // Bucketing in UTC would move a shop's whole evening onto the next day's
    // bar — the same reason the courier earnings query does it this way.
    const start = sql`(date_trunc('day', now() at time zone 'America/Montreal') - make_interval(days => ${days - 1}))`;
    const placedAt = sql`(${orders.createdAt} at time zone 'America/Montreal')`;

    const inWindow = and(eq(orders.vendorId, vendorId), sql`${placedAt} >= ${start}`)!;
    const earned = and(inWindow, sql`${orders.status} <> 'cancelled'`)!;

    const [totals, buckets, statusRows, top] = await Promise.all([
      this.db
        .select({
          revenueCad: sql<string>`coalesce(sum(${orders.subtotalCad}), 0)`,
          orderCount: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(earned),

      this.db
        .select({
          date: sql<string>`to_char(${placedAt}::date, 'YYYY-MM-DD')`,
          revenueCad: sql<string>`coalesce(sum(${orders.subtotalCad}), 0)`,
          orderCount: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(earned)
        .groupBy(sql`${placedAt}::date`)
        .orderBy(sql`${placedAt}::date`),

      // Counts every status, cancelled included — that is the point of it.
      this.db
        .select({ status: orders.status, count: sql<number>`count(*)::int` })
        .from(orders)
        .where(inWindow)
        .groupBy(orders.status),

      // Best sellers by units, with the revenue they actually brought in.
      // Joined through `order_items`, which holds the name and price as they
      // were at the time — the catalogue is mutable and an order is not.
      this.db
        .select({
          productId: orderItems.productId,
          name: sql<string>`max(${orderItems.name})`,
          qty: sql<number>`sum(${orderItems.qty})::int`,
          revenueCad: sql<string>`sum(${orderItems.unitPriceCad} * ${orderItems.qty})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(earned)
        .groupBy(orderItems.productId)
        .orderBy(sql`sum(${orderItems.qty}) desc`)
        .limit(5),
    ]);

    const revenueCad = Number(totals[0]?.revenueCad ?? 0);
    const orderCount = totals[0]?.orderCount ?? 0;

    // The rate comes from `platform_settings`, not a constant — an admin can
    // change it (Phase 8) and the dashboard has to follow. `commissionOn` in
    // the mobile app hardcodes 0.12 as an offline preview.
    const commissionCad = round2(revenueCad * rates.commissionRate);

    return {
      days,
      revenueCad,
      commissionCad,
      commissionRate: rates.commissionRate,
      /** What reaches the merchant from these sales, before the monthly subscription. */
      netCad: round2(revenueCad - commissionCad),
      monthlySubscriptionCad: rates.monthlySubscriptionCad,
      orderCount,
      avgBasketCad: orderCount > 0 ? round2(revenueCad / orderCount) : 0,
      // Empty days are filled in by the client, which knows the window it asked
      // for — generating a date series in SQL to ship all-zero rows is work for
      // nothing.
      buckets: buckets.map((b) => ({
        date: b.date,
        revenueCad: Number(b.revenueCad),
        orderCount: b.orderCount,
      })),
      statusCounts: Object.fromEntries(statusRows.map((s) => [s.status, s.count])),
      topProducts: top.map((p) => ({
        productId: p.productId,
        name: p.name,
        qty: p.qty,
        revenueCad: Number(p.revenueCad),
      })),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
