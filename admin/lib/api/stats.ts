import { apiGet } from './client';
import { delay } from './storage';
import { getSeed } from './seed';
import type { Order } from '../types';

export interface DailyPoint {
  date: string; // yyyy-mm-dd
  gmv: number;
  orders: number;
}

export interface TopVendor {
  vendorId: string;
  name: string;
  vendorType: string;
  revenueCad: number;
  orderCount: number;
}

export interface OverviewStats {
  gmvCad: number;
  gmvDeltaPct: number;
  orderCount: number;
  orderDeltaPct: number;
  commissionRevenueCad: number;
  activeMerchants: number;
  activeCouriers: number;
  pendingMerchants: number;
  pendingCouriers: number;
  openDisputes: number;
  openCourierIssues: number;
  series: DailyPoint[];
  topVendors: TopVendor[];
  ordersByVertical: { vertical: string; orders: number }[];
}

/** The `GET /admin/stats/overview` payload, before it is reshaped for this app. */
interface ApiOverview {
  range: 7 | 30 | 90;
  from: string;
  to: string;
  gmvCad: number;
  gmvDeltaPct: number;
  orderCount: number;
  orderDeltaPct: number;
  commissionRevenueCad: number;
  refundedCad: number;
  averageOrderValueCad: number;
  series: DailyPoint[];
  topVendors: TopVendor[];
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

/**
 * The API is language-neutral and returns the raw `vendor_type` enum; the
 * French labels are this app's business, like every other label in
 * `statusMeta.ts`. The mock baked them into the payload, which is what made
 * the API look like it should too.
 */
const VERTICAL_LABELS: Record<'grocery' | 'restaurant', string> = {
  grocery: 'Épicerie',
  restaurant: 'Restaurant',
};

export async function getOverviewStats(rangeDays: 7 | 30 | 90 = 30): Promise<OverviewStats> {
  const data = await apiGet<ApiOverview>('/admin/stats/overview', { range: rangeDays });

  return {
    gmvCad: data.gmvCad,
    gmvDeltaPct: data.gmvDeltaPct,
    orderCount: data.orderCount,
    orderDeltaPct: data.orderDeltaPct,
    commissionRevenueCad: data.commissionRevenueCad,
    // Flattened from `queues`, which is the whole `GET /admin/stats` row —
    // a superset of the six counts this screen shows.
    activeMerchants: data.queues.vendorsApproved,
    activeCouriers: data.queues.couriersApproved,
    pendingMerchants: data.queues.vendorsPending,
    pendingCouriers: data.queues.couriersPending,
    openDisputes: data.queues.disputesOpen,
    openCourierIssues: data.queues.courierIssuesOpen,
    series: data.series,
    topVendors: data.topVendors,
    ordersByVertical: data.ordersByVertical.map((v) => ({ vertical: VERTICAL_LABELS[v.vertical], orders: v.orders })),
  };
}

export interface QueueCounts {
  pendingMerchants: number;
  pendingCouriers: number;
  openDisputes: number;
  openCourierIssues: number;
}

/**
 * The sidebar's badge counts, in one request.
 *
 * The dashboard layout used to derive these by fetching four full lists and
 * reading `.length` — four round trips to render four integers, and wrong the
 * moment those lists paginate (it would have counted a page, not a queue).
 */
export async function getQueueCounts(): Promise<QueueCounts> {
  const s = await apiGet<ApiOverview['queues']>('/admin/stats');
  return {
    pendingMerchants: s.vendorsPending,
    pendingCouriers: s.couriersPending,
    openDisputes: s.disputesOpen,
    openCourierIssues: s.courierIssuesOpen,
  };
}

// ── merchant portal — still on mock data ────────────────────────────────────
//
// The merchant portal was out of scope for the API wiring, so everything below
// still reads `getSeed()`. Note it reads the seed's orders *directly* rather
// than calling `listOrders()` as it used to: that function now speaks HTTP to
// an admin-only endpoint, which a merchant session has no token for. Repointing
// it here is what keeps `/merchant` working unchanged.

export interface VendorOverviewStats {
  vendorId: string;
  vendorName: string;
  revenueCad: number;
  orderCount: number;
  /** Orders still moving through the kitchen/dispatch — not yet delivered or cancelled. */
  activeCount: number;
  series: DailyPoint[];
}

function isCounted(o: Order) {
  return o.status !== 'cancelled';
}

/** Scoped to one shop's own orders — what the merchant order dashboard reads. */
export async function getVendorOverview(vendorId: string, rangeDays: 7 | 30 | 90 = 30): Promise<VendorOverviewStats> {
  await delay(150, 300);
  const { vendors, orders: allOrders } = getSeed();
  const vendor = vendors.find((v) => v.id === vendorId);
  const orders = allOrders.filter((o) => o.vendorId === vendorId);

  const now = Date.now();
  const cutoff = now - rangeDays * 86400000;
  const inRange = orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff && isCounted(o));

  const series: DailyPoint[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const dayStart = now - i * 86400000;
    const date = new Date(dayStart).toISOString().slice(0, 10);
    const dayOrders = inRange.filter((o) => o.createdAt.slice(0, 10) === date);
    series.push({ date, gmv: round2(dayOrders.reduce((s, o) => s + o.totalCad, 0)), orders: dayOrders.length });
  }

  const activeStatuses: Order['status'][] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

  return {
    vendorId,
    vendorName: vendor?.name ?? vendorId,
    revenueCad: round2(inRange.reduce((s, o) => s + o.totalCad, 0)),
    orderCount: inRange.length,
    activeCount: orders.filter((o) => activeStatuses.includes(o.status)).length,
    series,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
