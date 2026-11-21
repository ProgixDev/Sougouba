import { apiGet, merchantApiGet } from './client';

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

// ── merchant portal ─────────────────────────────────────────────────────────
//
// The shop owner's own numbers, from `GET /vendors/me/analytics` — the same
// call the mobile app's analytics screen makes, with the merchant's token
// (`merchantApiGet`), never the admin's.

export interface VendorOverviewStats {
  /**
   * Product subtotal over the window, cancelled orders excluded — what the shop
   * sold. Not the order total: the delivery fee pays the courier, and TPS/TVQ
   * are collected for the government.
   */
  revenueCad: number;
  orderCount: number;
  /** Orders in the window still moving through the kitchen or dispatch. */
  activeCount: number;
  series: DailyPoint[];
}

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];

export async function getVendorOverview(rangeDays: 7 | 30 | 90 = 30): Promise<VendorOverviewStats> {
  const a = await merchantApiGet<{
    revenueCad: number;
    orderCount: number;
    buckets: { date: string; revenueCad: number; orderCount: number }[];
    statusCounts: Record<string, number>;
  }>('/vendors/me/analytics', { days: rangeDays });

  // The API sends only days that had orders; the chart wants every day.
  const byDate = new Map(a.buckets.map((b) => [b.date, b]));
  const series: DailyPoint[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const date = localDate(new Date(Date.now() - i * 86400000));
    const bucket = byDate.get(date);
    series.push({ date, gmv: bucket?.revenueCad ?? 0, orders: bucket?.orderCount ?? 0 });
  }

  return {
    revenueCad: a.revenueCad,
    orderCount: a.orderCount,
    activeCount: ACTIVE_STATUSES.reduce((sum, status) => sum + (a.statusCounts[status] ?? 0), 0),
    series,
  };
}

/** `yyyy-mm-dd` in the browser's day — the API buckets by Montréal day, which is the merchant's. */
function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
