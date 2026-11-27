'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { useToast } from '@/components/Toast';
import type { Page, PageQuery } from '@/lib/api/client';
import { formatNumber } from '@/lib/format';
import { t, useLocale } from '@/lib/i18n';
import { downloadCsv, EXPORT_MAX_ROWS, exportFilename, fetchAll, toCsv, type CsvColumn } from '@/lib/csv';

/**
 * « Exporter (CSV) »: every row of the list as it is filtered on screen, not
 * just the page shown. `fetchPage` is the list's own fetcher with its current
 * filters bound, so the file and the table can never disagree.
 */
export function ExportButton<T>({
  name,
  fetchPage,
  columns,
  sort,
  label = t('common.export.button'),
}: {
  /** The file's name before the date, e.g. `commandes`. */
  name: string;
  fetchPage: (page: PageQuery) => Promise<Page<T>>;
  columns: CsvColumn<T>[];
  sort?: Pick<PageQuery, 'sort' | 'dir'>;
  label?: string;
}) {
  useLocale();
  const toast = useToast();
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);

  async function run() {
    if (progress) return;
    setProgress({ loaded: 0, total: 0 });
    try {
      const rows = await fetchAll(fetchPage, (loaded, total) => setProgress({ loaded, total }), sort);
      if (rows.length === 0) {
        toast('info', t('common.export.nothing'));
        return;
      }
      downloadCsv(exportFilename(name), toCsv(rows, columns));
      toast(
        'success',
        rows.length >= EXPORT_MAX_ROWS
          ? t('common.export.limited', { count: formatNumber(rows.length) })
          // `count` picks singular or plural; `n` is the figure as it is written.
          : t('common.export.done', { count: rows.length, n: formatNumber(rows.length) })
      );
    } catch {
      toast('error', t('common.export.failed'));
    } finally {
      setProgress(null);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={!!progress}
      className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 font-sans text-[0.8125rem] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-70"
    >
      <Download size={15} />
      {progress
        ? progress.total > 0
          ? t('common.export.progress', { loaded: formatNumber(progress.loaded), total: formatNumber(progress.total) })
          : t('common.export.starting')
        : label}
    </button>
  );
}
