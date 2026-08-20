import { useCallback, useEffect, useState } from 'react';

import { ordersApi } from '@/data/api';
import type { ID, Order } from '@/data/types';

export interface CourierEarnings {
  /** Delivered runs, newest first. The history screen renders these directly. */
  runs: Order[];
  todayCad: number;
  runsToday: number;
  weekCad: number;
  runsWeek: number;
  allTimeCad: number;
  loading: boolean;
  reload: () => Promise<void>;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * What a courier has earned, aggregated from the orders they delivered.
 *
 * Derived rather than stored, for the same reason the position is: a running
 * total kept in a store drifts the moment a write is missed, and there is
 * already a record of every completed run. `earningsCad` is frozen onto the
 * delivery at completion, so the sum here cannot move retroactively if a rate
 * changes in `data/courierPay.ts`.
 *
 * The week starts seven days back rather than on Monday: a courier asking "what
 * have I made this week" means the last seven days, and a Monday boundary
 * answers "almost nothing" every Monday morning.
 */
export function useCourierEarnings(courierId: ID | undefined): CourierEarnings {
  const [runs, setRuns] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!courierId) {
      setRuns([]);
      return;
    }
    const all = await ordersApi.getOrdersForCourier(courierId);
    setRuns(all.filter((o) => o.status === 'delivered' && o.delivery));
  }, [courierId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    reload().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [reload]);

  const dayStart = startOfToday();
  const weekStart = dayStart - 6 * 86400000;

  const sumSince = (since: number) =>
    runs
      .filter((o) => Date.parse(o.delivery!.deliveredAt ?? o.createdAt) >= since)
      .reduce((sum, o) => sum + o.delivery!.earningsCad, 0);

  const countSince = (since: number) =>
    runs.filter((o) => Date.parse(o.delivery!.deliveredAt ?? o.createdAt) >= since).length;

  return {
    runs,
    todayCad: round2(sumSince(dayStart)),
    runsToday: countSince(dayStart),
    weekCad: round2(sumSince(weekStart)),
    runsWeek: countSince(weekStart),
    allTimeCad: round2(runs.reduce((sum, o) => sum + o.delivery!.earningsCad, 0)),
    loading,
    reload,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
