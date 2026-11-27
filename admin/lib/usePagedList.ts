'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '@/lib/api/client';
import { t } from './i18n';

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export interface PageRequest {
  offset: number;
  limit: number;
  sort: SortState;
}

/**
 * One database-paginated list: the page, its size, the sort, and the rows the
 * API returned for exactly that slice.
 *
 * `filtersKey` is anything that identifies the current filters (tab, search…);
 * when it changes the list goes back to page 1, since page 4 of the old
 * filter means nothing for the new one. A response that arrives after a newer
 * request has started is dropped, so a slow page can never overwrite a fast one.
 */
export function usePagedList<T>(
  fetchPage: (req: PageRequest) => Promise<Page<T>>,
  filtersKey: string,
  { pageSize: initialSize = 20, sort: initialSort = null }: { pageSize?: number; sort?: SortState } = {}
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const [sort, setSort] = useState<SortState>(initialSort);
  const [rows, setRows] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const requestId = useRef(0);

  // A new filter or sort starts again from the first page.
  const lastKey = useRef(filtersKey);
  useEffect(() => {
    if (lastKey.current !== filtersKey) {
      lastKey.current = filtersKey;
      setPage(1);
    }
  }, [filtersKey]);

  useEffect(() => {
    const id = ++requestId.current;
    setRows(null);
    setError(null);
    fetchRef
      .current({ offset: (page - 1) * pageSize, limit: pageSize, sort })
      .then((res) => {
        if (id !== requestId.current) return;
        // A page emptied by a deletion elsewhere: step back to the last real page.
        if (res.items.length === 0 && res.total > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(res.total / pageSize)));
          return;
        }
        setRows(res.items);
        setTotal(res.total);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setRows([]);
        setTotal(0);
        setError(e instanceof Error ? e.message : t('common.errors.loadFailed'));
      });
  }, [page, pageSize, sort, filtersKey, reloadTick]);

  return {
    rows,
    total,
    error,
    page,
    pageSize,
    sort,
    setPage,
    setPageSize: useCallback((size: number) => {
      setPageSize(size);
      setPage(1);
    }, []),
    setSort: useCallback((next: SortState) => {
      setSort(next);
      setPage(1);
    }, []),
    /** Fetch the current page again — after an action changed a row. */
    reload: useCallback(() => setReloadTick((t) => t + 1), []),
  };
}

/** `value`, once it has stopped changing for `ms` — a search box that does not fire a request per keystroke. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
