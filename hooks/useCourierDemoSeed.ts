import { useEffect, useRef } from 'react';

import { couriersApi, ordersApi } from '@/data/api';
import type { Courier, ID } from '@/data/types';

/**
 * Put a history behind a courier who has just been cleared to drive.
 *
 * The courier twin of `useDemoSeed`, and it makes the same argument: only the
 * eight seeded couriers appear on any delivery, so an account registered during
 * a demo opens on an empty Courses tab, a Gains screen reading 0,00 $ and a
 * profile that says "nouveau" — three of the four courier screens demonstrating
 * nothing at all.
 *
 * Gated on `approved`, not merely on having a file. A pending courier is behind
 * `CourierGate` and cannot see any of it, and writing eighty deliveries against
 * someone the platform has not cleared would be the wrong record to leave in the
 * table if approval never came.
 *
 * Two writes, and they can be interrupted between: the runs go into the orders
 * table, then the courier's own file is reconciled to match them. The second
 * half is therefore also reachable on its own — see `reconcile` below.
 */
export function useCourierDemoSeed(courier: Courier | null | undefined, onSeeded?: () => void) {
  const attempted = useRef<ID | null>(null);
  // Held in a ref so the effect does not depend on it. Callers pass an inline
  // closure, which would otherwise re-run this on every render of the screen
  // that owns it.
  const onSeededRef = useRef(onSeeded);
  onSeededRef.current = onSeeded;

  // Primitives, not the courier object. `useCourierProfile` hands back a fresh
  // object on every focus, so depending on it re-ran this effect mid-flight —
  // and the cleanup of the aborted run cancelled the reconciliation, leaving a
  // courier with ninety-seven deliveries and a profile still reading "nouveau".
  const courierId = courier?.status === 'approved' ? courier.id : undefined;
  const deliveryCount = courier?.deliveryCount ?? 0;

  useEffect(() => {
    if (!courier || !courierId) return;
    if (attempted.current === courierId) return;
    attempted.current = courierId;

    let cancelled = false;

    (async () => {
      const created = await ordersApi.ensureDemoRuns({
        id: courier.id,
        base: courier.base,
        vehicle: courier.vehicle,
      });

      if (created.length > 0) {
        await couriersApi.recordDemoHistory(courierId, created.length);
      } else if (deliveryCount === 0) {
        // This courier already has runs but a file that does not know it —
        // either an earlier seeding was interrupted between the two writes, or
        // the runs arrived some other way. Counting them is cheap and it is the
        // only path that repairs an account already in that state.
        const existing = await ordersApi.getOrdersForCourier(courierId);
        const delivered = existing.filter((o) => o.status === 'delivered').length;
        if (delivered === 0) return;
        await couriersApi.recordDemoHistory(courierId, delivered);
      } else {
        return;
      }

      // Only the callback is cancellable: it refetches into a screen that may
      // have gone. The writes above must not be — abandoning them halfway is
      // what produced the inconsistent state this now repairs.
      if (cancelled) return;
      onSeededRef.current?.();
    })();

    return () => {
      cancelled = true;
    };
    // `courier` is read inside but deliberately not a dependency; see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierId, deliveryCount]);
}
