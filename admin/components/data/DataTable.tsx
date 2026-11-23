'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { TableSkeleton } from './Skeleton';
import { Pagination } from './Pagination';
import type { SortState } from '@/lib/usePagedList';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  className?: string;
  /**
   * On a phone the table becomes a list of cards: the first column is the
   * card's title, every other column a "header — value" line. `hide` leaves a
   * column out of the card (a detail the list does not need on a small screen).
   */
  mobile?: 'hide';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription?: string;
  /** Rows per page — a plain few-hundred-row table doesn't need virtualization, just paging. */
  pageSize?: number;
  /**
   * Paginated and sorted by the API instead of in the browser: `rows` is one
   * page, `total` the whole result. Pair with `usePagedList`. A column's
   * `key` is what is sent as the sort, so it must be one the endpoint accepts.
   */
  server?: {
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
    onPageSize?: (size: number) => void;
    sort: SortState;
    onSort: (sort: SortState) => void;
  };
}

export function DataTable<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  loading,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  pageSize = 20,
  server,
}: DataTableProps<T>) {
  const [localSort, setLocalSort] = useState<SortState>(null);
  const [page, setPage] = useState(1);
  const sort = server ? server.sort : localSort;
  const setSort = (update: (s: SortState) => SortState) => (server ? server.onSort(update(server.sort)) : setLocalSort(update));

  const sorted = useMemo(() => {
    if (server || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, columns, server]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Reset to page 1 whenever the underlying result set changes (a new filter/search/sort
  // can leave `page` pointing past the end of a much shorter list).
  useEffect(() => {
    setPage(1);
  }, [rows, sort]);
  const clampedPage = Math.min(page, pageCount);
  const pageRows = server ? rows : sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  if (loading) return <TableSkeleton cols={columns.length} />;
  if (rows.length === 0 && !(server && server.total > 0))
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;

  const [titleCol, ...detailCols] = columns;
  const sortable = columns.filter((c) => c.sortable);

  return (
    <div>
      {/* Phones: one card per row. A table this wide only ever scrolled sideways there. */}
      <div className="md:hidden">
        {sortable.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <label className="flex flex-1 items-center gap-2 font-sans text-[0.8125rem] text-muted-foreground">
              Trier par
              <select
                value={sort ? `${sort.key}:${sort.dir}` : ''}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':');
                  setSort(() => (key ? { key, dir: dir as 'asc' | 'desc' } : null));
                }}
                className="min-w-0 flex-1 cursor-pointer rounded-lg border border-border bg-card px-2 py-1.5 text-foreground outline-none"
              >
                <option value="">Par défaut</option>
                {sortable.flatMap((c) => [
                  <option key={`${c.key}:asc`} value={`${c.key}:asc`}>
                    {c.header} (croissant)
                  </option>,
                  <option key={`${c.key}:desc`} value={`${c.key}:desc`}>
                    {c.header} (décroissant)
                  </option>,
                ])}
              </select>
            </label>
          </div>
        )}
        <ul>
          {pageRows.map((row) => (
            <li
              key={keyField(row)}
              onClick={() => onRowClick?.(row)}
              className={cn('flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-0', onRowClick && 'cursor-pointer active:bg-muted')}
            >
              <div className="min-w-0 font-sans text-[0.875rem]">{titleCol.render(row)}</div>
              {detailCols
                .filter((c) => c.mobile !== 'hide')
                .map((col) => (
                  <div key={col.key} className="flex min-w-0 items-center justify-between gap-3 font-sans text-[0.8125rem]">
                    {col.header && <span className="shrink-0 text-muted-foreground">{col.header}</span>}
                    <div className={cn('min-w-0 text-right', !col.header && 'ml-auto')}>{col.render(row)}</div>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse font-sans text-[0.8125rem]">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : undefined}
                    className={cn('px-5 py-3 text-left font-semibold text-muted-foreground', col.className)}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground"
                        onClick={() =>
                          setSort((s) =>
                            s?.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }
                          )
                        }
                      >
                        {col.header}
                        {active ? sort!.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ChevronsUpDown size={13} className="opacity-40" />}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={keyField(row)}
                onClick={() => onRowClick?.(row)}
                className={cn('border-b border-border last:border-0', onRowClick && 'cursor-pointer hover:bg-muted')}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-5 py-3.5 align-middle', col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {server && (
        <Pagination page={server.page} pageSize={server.pageSize} total={server.total} onPage={server.onPage} onPageSize={server.onPageSize} />
      )}

      {!server && pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 md:px-5">
          <span className="font-sans text-[0.75rem] text-muted-foreground">
            {sorted.length} résultats · page {clampedPage} sur {pageCount}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="Page précédente"
              disabled={clampedPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              aria-label="Page suivante"
              disabled={clampedPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
