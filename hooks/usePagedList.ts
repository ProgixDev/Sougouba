import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { NativeScrollEvent } from 'react-native';

import type { Page } from '@/data/http';

/** Rows per request. Small enough to paint fast, large enough that a fling rarely hits the end. */
export const PAGE_SIZE = 20;

/**
 * A list read from the API one page at a time, for an infinite-scroll
 * `FlatList` / `SectionList`.
 *
 * Every list used to ask for 100 rows and stop there, so the 101st order,
 * product or shop simply did not exist on the phone. This asks for
 * `PAGE_SIZE` at a time and keeps asking while the API's `total` says there is
 * more: wire `loadMore` to `onEndReached`, `refresh` to the pull-to-refresh,
 * and render `items`.
 *
 * `key` must include every filter the fetcher closes over — a new key is a new
 * list, started again from the first page.
 */
export function usePagedList<T>(
  key: QueryKey,
  fetchPage: (offset: number, limit: number) => Promise<Page<T>>,
  { enabled = true, pageSize = PAGE_SIZE }: { enabled?: boolean; pageSize?: number } = {}
) {
  const query = useInfiniteQuery({
    queryKey: [...key, 'paged', pageSize],
    queryFn: ({ pageParam }) => fetchPage(pageParam, pageSize),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      // An empty page also ends it: a row deleted mid-scroll must not loop.
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
    enabled,
  });

  const items = useMemo(() => {
    // A row can shift onto the next page when one is added above it between
    // two requests; keep the first copy so a list never shows it twice.
    const seen = new Set<string>();
    const out: T[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        const id = (item as { id?: string }).id;
        if (id !== undefined) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        out.push(item);
      }
    }
    return out;
  }, [query.data]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Pull-to-refresh shows its own spinner, not the background refetches.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return {
    items,
    total: query.data?.pages[0]?.total ?? 0,
    /** First page still on its way — show the skeleton. */
    loading: query.isPending && enabled,
    error: query.error,
    loadingMore: isFetchingNextPage,
    hasMore: hasNextPage,
    loadMore,
    refreshing,
    refresh,
    /** Re-fetch silently (focus, after an action) — keeps what is on screen meanwhile. */
    reload: refetch,
  };
}

/**
 * For a paged list inside a plain `ScrollView` (a grid, a card of rows): true
 * once the viewport is within `margin` of the end — call `loadMore` then.
 * A `FlatList` uses `onEndReached` instead.
 */
export function isNearBottom(
  { layoutMeasurement, contentOffset, contentSize }: NativeScrollEvent,
  margin = 600
): boolean {
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - margin;
}
