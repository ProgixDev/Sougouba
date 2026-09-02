import { delay } from './storage';
import { getSeed } from './seed';
import { getSettings } from './settings';
import { listOrders } from './orders';
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

function isCounted(o: Order) {
  return o.status !== 'cancelled';
}

export async function getOverviewStats(rangeDays: 7 | 30 | 90 = 30): Promise<OverviewStats> {
  await delay(200, 400);
  const { orders, vendors, couriers, disputes, courierIssues } = getSeed();
  const settings = await getSettings();

  const now = Date.now();
  const cutoff = now - rangeDays * 86400000;
  const prevCutoff = cutoff - rangeDays * 86400000;

  const inRange = orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff && isCounted(o));
  const inPrevRange = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= prevCutoff && t < cutoff && isCounted(o);
  });

  const gmvCad = round2(inRange.reduce((sum, o) => sum + o.totalCad, 0));
  const prevGmv = round2(inPrevRange.reduce((sum, o) => sum + o.totalCad, 0));
  const orderCount = inRange.length;
  const prevOrderCount = inPrevRange.length;

  const subtotalSum = inRange.reduce((sum, o) => sum + o.subtotalCad, 0);
  const commissionRevenueCad = round2(subtotalSum * settings.commissionRate);

  const series: DailyPoint[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const dayStart = now - i * 86400000;
    const date = new Date(dayStart).toISOString().slice(0, 10);
    const dayOrders = inRange.filter((o) => o.createdAt.slice(0, 10) === date);
    series.push({ date, gmv: round2(dayOrders.reduce((s, o) => s + o.totalCad, 0)), orders: dayOrders.length });
  }

  const revenueByVendor = new Map<string, { revenueCad: number; orderCount: number }>();
  for (const o of inRange) {
    const entry = revenueByVendor.get(o.vendorId) ?? { revenueCad: 0, orderCount: 0 };
    entry.revenueCad += o.totalCad;
    entry.orderCount += 1;
    revenueByVendor.set(o.vendorId, entry);
  }
  const topVendors: TopVendor[] = [...revenueByVendor.entries()]
    .map(([vendorId, v]) => {
      const vendor = vendors.find((x) => x.id === vendorId);
      return {
        vendorId,
        name: vendor?.name ?? vendorId,
        vendorType: vendor?.vendorType ?? '—',
        revenueCad: round2(v.revenueCad),
        orderCount: v.orderCount,
      };
    })
    .sort((a, b) => b.revenueCad - a.revenueCad)
    .slice(0, 6);

  const verticalCounts = new Map<string, number>();
  for (const o of inRange) {
    const vendor = vendors.find((v) => v.id === o.vendorId);
    const key = vendor?.vendorType === 'restaurant' ? 'Restaurant' : 'Épicerie';
    verticalCounts.set(key, (verticalCounts.get(key) ?? 0) + 1);
  }

  return {
    gmvCad,
    gmvDeltaPct: prevGmv > 0 ? round2(((gmvCad - prevGmv) / prevGmv) * 100) : 0,
    orderCount,
    orderDeltaPct: prevOrderCount > 0 ? round2(((orderCount - prevOrderCount) / prevOrderCount) * 100) : 0,
    commissionRevenueCad,
    activeMerchants: vendors.filter((v) => v.status === 'approved').length,
    activeCouriers: couriers.filter((c) => c.status === 'approved').length,
    pendingMerchants: vendors.filter((v) => v.status === 'pending').length,
    pendingCouriers: couriers.filter((c) => c.status === 'pending').length,
    openDisputes: disputes.filter((d) => d.status === 'open').length,
    openCourierIssues: courierIssues.filter((i) => i.status === 'open').length,
    series,
    topVendors,
    ordersByVertical: [...verticalCounts.entries()].map(([vertical, count]) => ({ vertical, orders: count })),
  };
}

export interface VendorOverviewStats {
  vendorId: string;
  vendorName: string;
  revenueCad: number;
  orderCount: number;
  /** Orders still moving through the kitchen/dispatch — not yet delivered or cancelled. */
  activeCount: number;
  series: DailyPoint[];
}

/** Scoped to one shop's own orders — what the merchant order dashboard reads. */
export async function getVendorOverview(vendorId: string, rangeDays: 7 | 30 | 90 = 30): Promise<VendorOverviewStats> {
  await delay(150, 300);
  const { vendors } = getSeed();
  const vendor = vendors.find((v) => v.id === vendorId);
  const orders = await listOrders({ vendorId });

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
