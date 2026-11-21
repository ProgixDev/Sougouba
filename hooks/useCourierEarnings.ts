import { useCallback, useEffect, useState } from 'react';

import { ordersApi } from '@/data/api';
import type { ID, Order } from '@/data/types';

export interface CourierEarnings {
  /**
   * Delivered runs of the last `RECENT_DAYS` days, newest first — every one of
   * them, however many: the earnings screen compares a window with the one
   * before it, and that comparison is only right on the complete set.
   */
  runs: Order[];
  todayCad: number;
  runsToday: number;
  weekCad: number;
  runsWeek: number;
  /** Over the courier's whole history, summed by the database. */
  allTimeCad: number;
  allTimeRuns: number;
  allTimeKm: number;
  loading: boolean;
  reload: () => Promise<void>;
}

/** The longest window the earnings screen shows (30 days) and the one before it. */
const RECENT_DAYS = 60;

/** "All time" for the totals endpoint — ten years, its ceiling. */
const ALL_TIME_DAYS = 3650;

/** Rows per request while gathering the recent runs. */
const BATCH = 100;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const deliveredAt = (o: Order) => Date.parse(o.delivery?.deliveredAt ?? o.createdAt);

/**
 * What a courier has earned.
 *
 * The recent runs are read page by page until the window is covered, rather
 * than one capped request: a busy courier passes 100 runs well inside two
 * months, and the old single request silently dropped the rest. Totals over the
 * whole history come from the API's own sum instead of from whatever loaded.
 *
 * `earningsCad` is frozen onto the delivery at completion, so none of these
 * figures can move retroactively if a rate changes in `data/courierPay.ts`.
 * The week starts seven days back rather than on Monday: a courier asking
 * "what have I made this week" means the last seven days.
 */
export function useCourierEarnings(courierId: ID | undefined): CourierEarnings {
  const [runs, setRuns] = useState<Order[]>([]);
  const [allTime, setAllTime] = useState({ earningsCad: 0, runCount: 0, distanceKm: 0 });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!courierId) {
      setRuns([]);
      return;
    }
    const since = startOfToday() - (RECENT_DAYS - 1) * 86400000;
    const recent: Order[] = [];
    // Newest first, so the first run older than the window ends the walk.
    for (let offset = 0; ; offset += BATCH) {
      const page = await ordersApi.getCourierRunsPage(offset, BATCH, { deliveredOnly: true });
      recent.push(...page.items.filter((o) => o.delivery));
      const last = page.items[page.items.length - 1];
      if (!last || deliveredAt(last) < since || offset + BATCH >= page.total) break;
    }
    setRuns(recent.filter((o) => deliveredAt(o) >= since));

    const totals = await ordersApi.getCourierTotals(ALL_TIME_DAYS);
    setAllTime({ earningsCad: totals.earningsCad, runCount: totals.runCount, distanceKm: totals.distanceKm });
  }, [courierId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    reload()
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const dayStart = startOfToday();
  const weekStart = dayStart - 6 * 86400000;

  const sumSince = (since: number) =>
    runs.filter((o) => deliveredAt(o) >= since).reduce((sum, o) => sum + o.delivery!.earningsCad, 0);

  const countSince = (since: number) => runs.filter((o) => deliveredAt(o) >= since).length;

  return {
    runs,
    todayCad: round2(sumSince(dayStart)),
    runsToday: countSince(dayStart),
    weekCad: round2(sumSince(weekStart)),
    runsWeek: countSince(weekStart),
    allTimeCad: round2(allTime.earningsCad),
    allTimeRuns: allTime.runCount,
    allTimeKm: allTime.distanceKm,
    loading,
    reload,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
