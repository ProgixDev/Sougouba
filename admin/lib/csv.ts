import type { Page, PageQuery } from './api/client';

/**
 * CSV exports of the back office's lists, built in the browser from the same
 * paginated endpoints the tables read — so an export carries exactly the
 * permissions and filters of the list on screen, and no second, unchecked
 * path to the data exists on the API.
 *
 * Written for Excel in French: `;` between fields and a decimal comma, which
 * is what it expects on a fr-CA machine, and a UTF-8 byte-order mark so
 * "Épicerie" does not open as "Ã‰picerie". Google Sheets and Numbers read it
 * as is.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

/** The API's page ceiling (`MAX_PAGE_SIZE`). */
const PAGE = 100;

/** A guard, not a business rule: past this, an export belongs in a database tool. */
export const EXPORT_MAX_ROWS = 20_000;

const SEPARATOR = ';';

/**
 * Every row of a filtered list, page by page. `onProgress` gets the running
 * count and the total once the first page has said what it is.
 */
export async function fetchAll<T>(
  fetchPage: (page: PageQuery) => Promise<Page<T>>,
  onProgress?: (loaded: number, total: number) => void,
  sort?: Pick<PageQuery, 'sort' | 'dir'>
): Promise<T[]> {
  const rows: T[] = [];
  let total = Infinity;
  while (rows.length < Math.min(total, EXPORT_MAX_ROWS)) {
    const page = await fetchPage({ offset: rows.length, limit: PAGE, ...sort });
    total = page.total;
    rows.push(...page.items);
    onProgress?.(rows.length, total);
    if (page.items.length === 0) break;
  }
  return rows.slice(0, EXPORT_MAX_ROWS);
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)), ...rows.map((row) => columns.map((c) => cell(c.value(row))))];
  return lines.map((l) => l.join(SEPARATOR)).join('\r\n');
}

function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'number' ? String(value).replace('.', ',') : typeof value === 'boolean' ? (value ? 'oui' : 'non') : value;
  // A cell starting with = + - @ is run as a formula by Excel. Names and
  // messages come from users, so they are defused rather than trusted.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** `commandes-2026-11-23.csv` — the date of the export, in Montreal. */
export function exportFilename(name: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal' }).format(new Date());
  return `${name}-${day}.csv`;
}

/** `2026-11-23 14:05`, Montreal time: sortable, and read by Excel as a date. */
export function csvDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montreal',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}
