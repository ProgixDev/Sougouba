import { useCallback, useState } from 'react';

import { ordersApi } from '@/data/api';
import type { Order } from '@/data/types';

/** Rows per request while gathering the window. */
const BATCH = 100;

/**
 * Every order the signed-in merchant's shop received in the last `days` days,
 * newest first.
 *
 * The dashboard and the analytics screen compare a window with the one before
 * it (`lib/analytics.ts`), which is only right on the complete set. They used
 * to read one capped request of 100 orders, so a busy shop's comparison quietly
 * lost its older half. This walks the pages until the window is covered.
 */
export function useVendorRecentOrders(days: number) {
  const [orders, setOrders] = useState<Order[]>([]);

  const load = useCallback(async () => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    const from = since.getTime();

    const collected: Order[] = [];
    // Newest first, so the first order older than the window ends the walk.
    for (let offset = 0; ; offset += BATCH) {
      const page = await ordersApi.getVendorOrdersPage('all', offset, BATCH);
      collected.push(...page.items);
      const last = page.items[page.items.length - 1];
      if (!last || Date.parse(last.createdAt) < from || offset + BATCH >= page.total) break;
    }
    const inWindow = collected.filter((o) => Date.parse(o.createdAt) >= from);
    setOrders(inWindow);
    return inWindow;
  }, [days]);

  return { orders, load };
}
