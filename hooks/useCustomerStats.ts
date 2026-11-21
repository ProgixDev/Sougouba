import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ordersApi } from '@/data/api';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useSessionStore } from '@/store/useSessionStore';

export interface CustomerStats {
  orderCount: number;
  favoriteCount: number;
  spentCad: number;
  loading: boolean;
}

/**
 * The three numbers on the profile.
 *
 * Cancelled orders are excluded from both the count and the total: they cost
 * nothing and were never received, so counting them would make the profile
 * disagree with the shop-side dashboard, which already excludes them.
 *
 * Refetches on focus because placing or cancelling an order happens elsewhere in
 * the stack and the mock table is mutated in place.
 */
export function useCustomerStats(): CustomerStats {
  const user = useSessionStore((s) => s.user);
  const favoriteCount = useFavoritesStore((s) => s.productIds.length + s.vendorIds.length);

  const [orderCount, setOrderCount] = useState(0);
  const [spentCad, setSpentCad] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;

      // Summed by the database over every order, not the latest 100.
      ordersApi
        .getMyOrderStats()
        .then((stats) => {
          if (!active) return;
          setOrderCount(stats.orderCount);
          setSpentCad(stats.spentCad);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, [user])
  );

  return { orderCount, favoriteCount, spentCad, loading };
}
