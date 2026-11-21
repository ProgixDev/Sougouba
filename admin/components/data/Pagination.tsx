'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export const PAGE_SIZES = [10, 20, 50, 100] as const;

/**
 * Which page numbers to show: always the first and last, the current one and
 * its neighbours, and an ellipsis for each gap — "1 … 4 5 6 … 12".
 */
function pageItems(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const items: (number | 'gap')[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) items.push('gap');
  for (let p = from; p <= to; p++) items.push(p);
  if (to < pageCount - 1) items.push('gap');
  items.push(pageCount);
  return items;
}

const BUTTON =
  'inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg px-2 font-sans text-[0.8125rem] tabular transition-colors disabled:cursor-not-allowed disabled:opacity-40';

/** The footer of every database-paginated table: range, page numbers, rows per page. */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
      <div className="flex items-center gap-4">
        <span className="font-sans text-[0.8125rem] tabular text-muted-foreground">
          {first}–{last} sur {total.toLocaleString('fr-CA')}
        </span>
        {onPageSize && (
          <label className="hidden items-center gap-2 font-sans text-[0.8125rem] text-muted-foreground sm:flex">
            Lignes
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="cursor-pointer rounded-lg border border-border bg-card px-2 py-1 text-foreground outline-none focus:border-primary"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <button type="button" aria-label="Page précédente" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn(BUTTON, 'hover:bg-muted')}>
            <ChevronLeft size={16} />
          </button>
          {pageItems(page, pageCount).map((item, i) =>
            item === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 font-sans text-[0.8125rem] text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPage(item)}
                className={cn(BUTTON, item === page ? 'bg-forest-600 font-semibold text-white' : 'text-foreground hover:bg-muted')}
              >
                {item}
              </button>
            )
          )}
          <button
            type="button"
            aria-label="Page suivante"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
            className={cn(BUTTON, 'hover:bg-muted')}
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </div>
  );
}
