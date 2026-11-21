import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
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
    const row = await unwrap<{ id: string } | null>(
      this.db.from('vendors').select('id').eq('owner_id', userId).maybeSingle()
    );
    if (!row) throw new NotFoundException('This account has no shop');
    return row.id;
  }

  /**
   * What selling here costs today — the rates an administrator set in
   * `platform_settings`, for the merchant screens that state them. Same
   * numbers every merchant pays, so there is no shop to look up.
   */
  async plan() {
    const rates = await this.settings.all();
    return { commissionRate: rates.commissionRate, monthlySubscriptionCad: rates.monthlySubscriptionCad };
  }

  async forOwner(userId: string, days: number) {
    const vendorId = await this.vendorIdFor(userId);
    const rates = await this.settings.all();

    // One call. The window is truncated to midnight in **Montreal time** inside
    // the function — bucketing in UTC would move a shop's whole evening onto
    // the next day's bar, the same reason the courier earnings query does it
    // that way. See `merchant_analytics`.
    const agg = await unwrap<{
      revenueCad: number;
      orderCount: number;
      buckets: { date: string; revenueCad: number; orderCount: number }[];
      statusCounts: Record<string, number>;
      topProducts: { productId: string; name: string; qty: number; revenueCad: number }[];
    }>(this.db.rpc('merchant_analytics', { p_vendor_id: vendorId, p_days: days }));

    const revenueCad = agg.revenueCad ?? 0;
    const orderCount = agg.orderCount ?? 0;

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
      buckets: agg.buckets ?? [],
      statusCounts: agg.statusCounts ?? {},
      topProducts: agg.topProducts ?? [],
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
