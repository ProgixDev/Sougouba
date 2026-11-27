'use client';
import { useLocale } from '@/lib/i18n';

/**
 * The tooltip every chart uses, drawn with the theme's own colours.
 *
 * Recharts' default tooltip is a white box with inline styles: in dark mode
 * its label (the date) came out light grey on white and could not be read.
 * Tailwind classes follow the `dark` class like the rest of the dashboard.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel = (l) => String(l),
  formatValue = (v) => String(v),
  name,
}: {
  active?: boolean;
  payload?: { value?: number | string; name?: string; color?: string; fill?: string; stroke?: string }[];
  label?: string | number;
  formatLabel?: (label: string | number) => string;
  formatValue?: (value: number, name?: string) => string;
  /** One series' name, e.g. "Commandes"; several series use their own names. */
  name?: (seriesName?: string) => string;
}) {
  useLocale();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-card">
      {label !== undefined && label !== '' && (
        <p className="mb-1 font-sans text-[0.75rem] font-semibold text-muted-foreground">{formatLabel(label)}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 font-sans text-[0.8125rem] text-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color ?? entry.fill ?? entry.stroke ?? 'currentColor' }}
          />
          {name ? <span className="text-muted-foreground">{name(entry.name)}</span> : null}
          <span className="font-semibold tabular">{formatValue(Number(entry.value ?? 0), entry.name)}</span>
        </p>
      ))}
    </div>
  );
}
