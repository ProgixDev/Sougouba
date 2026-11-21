import type { ID, Order, OrderStatus } from '@/data/types';
import { commissionOn } from './monetization';

export interface DayBucket {
  /** `YYYY-MM-DD` in local time. */
  date: string;
  /** Short French day/date label for a chart axis. */
  label: string;
  revenueCad: number;
  orderCount: number;
}

export interface RangeSummary {
  /** Goods sold — see the note on `summariseOrders`. */
  revenueCad: number;
  /** Sougouba's 12 % cut of `revenueCad`. */
  commissionCad: number;
  /** What reaches the merchant from these sales, before the monthly subscription. */
  netCad: number;
  orderCount: number;
  avgBasketCad: number;
  buckets: DayBucket[];
  topProducts: { productId: ID; name: string; qty: number; revenueCad: number }[];
  statusCounts: Partial<Record<OrderStatus, number>>;
}

/**
 * Pure aggregation, kept out of the screen so the numbers can be reasoned about
 * (and checked by `scripts/verify-seed.ts`) without mounting a chart.
 *
 * Cancelled orders are excluded from revenue but still counted in
 * `statusCounts` — a shop needs to see its cancellation rate, but cancelled
 * money was never earned.
 *
 * **Revenue is the product subtotal, not the order total.** It used to be
 * `order.totalCad`, which was already generous — the delivery fee in it pays the
 * delivery, not the shop — and became plainly wrong once orders started carrying
 * TPS and TVQ, money the merchant collects on the government's behalf and does
 * not keep. A dashboard that counts it as "Recettes" tells a merchant they
 * earned about 20 % more than they did.
 *
 * `commissionRate` is the live one from `usePlatformPlan` — the administrator
 * can change it, so it is passed in rather than read from a constant.
 */
export function summariseOrders(orders: Order[], days: number, commissionRate: number, now = new Date()): RangeSummary {
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));

  const buckets: DayBucket[] = [];
  const byDate = new Map<string, DayBucket>();
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const bucket: DayBucket = {
      date: toKey(day),
      label: labelFor(day, days),
      revenueCad: 0,
      orderCount: 0,
    };
    buckets.push(bucket);
    byDate.set(bucket.date, bucket);
  }

  const statusCounts: Partial<Record<OrderStatus, number>> = {};
  const productTotals = new Map<ID, { name: string; qty: number; revenueCad: number }>();

  let revenueCad = 0;
  let orderCount = 0;

  for (const order of orders) {
    const placed = new Date(order.createdAt);
    if (placed < start) continue;

    statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
    if (order.status === 'cancelled') continue;

    revenueCad += order.subtotalCad;
    orderCount += 1;

    const bucket = byDate.get(toKey(placed));
    if (bucket) {
      bucket.revenueCad += order.subtotalCad;
      bucket.orderCount += 1;
    }

    for (const item of order.items) {
      const current = productTotals.get(item.productId) ?? {
        name: item.name,
        qty: 0,
        revenueCad: 0,
      };
      current.qty += item.qty;
      current.revenueCad += item.unitPriceCad * item.qty;
      productTotals.set(item.productId, current);
    }
  }

  const topProducts = [...productTotals.entries()]
    .map(([productId, v]) => ({ productId, ...v, revenueCad: round2(v.revenueCad) }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const sales = round2(revenueCad);
  const commissionCad = commissionOn(sales, commissionRate);

  return {
    revenueCad: sales,
    commissionCad,
    netCad: round2(sales - commissionCad),
    orderCount,
    avgBasketCad: orderCount > 0 ? round2(revenueCad / orderCount) : 0,
    buckets: buckets.map((b) => ({ ...b, revenueCad: round2(b.revenueCad) })),
    topProducts,
    statusCounts,
  };
}

export interface PeriodComparison {
  current: RangeSummary;
  previous: RangeSummary;
  /** Percent change vs the preceding window, or null when there is no base to compare against. */
  revenueDeltaPct: number | null;
  orderDeltaPct: number | null;
  basketDeltaPct: number | null;
}

/**
 * The same window, and the one immediately before it.
 *
 * A merchant reads a figure as a direction before they read it as an amount:
 * "$214 this week" only means something next to last week's. The previous window
 * is the same summary taken `days` earlier, so the two are computed identically
 * and cannot drift apart.
 */
export function comparePeriods(
  orders: Order[],
  days: number,
  commissionRate: number,
  now = new Date()
): PeriodComparison {
  const previousNow = new Date(now);
  previousNow.setDate(previousNow.getDate() - days);

  const current = summariseOrders(orders, days, commissionRate, now);
  const previous = summariseOrders(orders, days, commissionRate, previousNow);

  return {
    current,
    previous,
    revenueDeltaPct: percentChange(previous.revenueCad, current.revenueCad),
    orderDeltaPct: percentChange(previous.orderCount, current.orderCount),
    basketDeltaPct: percentChange(previous.avgBasketCad, current.avgBasketCad),
  };
}

/** Null rather than Infinity when the base is zero — "up ∞%" is not a fact a shop can act on. */
function percentChange(from: number, to: number): number | null {
  if (from <= 0) return null;
  return Math.round(((to - from) / from) * 100);
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Local-time key, so an evening order doesn't land on the next UTC day. */
function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** Weekday initials read better over a week; longer ranges need the date. */
function labelFor(date: Date, days: number): string {
  return days <= 7 ? WEEKDAYS[date.getDay()] : String(date.getDate());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
