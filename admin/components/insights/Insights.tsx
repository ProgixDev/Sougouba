'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Skeleton } from '@/components/data/Skeleton';
import { cn } from '@/lib/cn';
import { mediaUrl } from '@/lib/media';

/**
 * The building blocks every back-office section uses above its list: a page
 * header, KPI cards, a small chart, a breakdown, a top five. One look across
 * the dashboard, so a number means the same thing wherever it sits.
 */

/** Brand colours as hex, for the charts (Recharts does not read Tailwind classes). */
export const CHART = {
  forest: '#35875C',
  forestDeep: '#246B47',
  mustard: '#D89A1E',
  terracotta: '#D9642C',
  neutral: '#A9A196',
  grid: '#E2DED7',
};

/** Distinct, on-brand colours for a breakdown's segments, in order. */
export const SERIES = ['#35875C', '#D89A1E', '#D9642C', '#82BE9C', '#8E6013', '#A9A196', '#9C401B'];

type Tone = 'forest' | 'mustard' | 'terracotta' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  forest: 'bg-forest-50 text-forest-700 dark:bg-forest-950 dark:text-forest-200',
  mustard: 'bg-mustard-50 text-mustard-800 dark:bg-mustard-950 dark:text-mustard-200',
  terracotta: 'bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-950 dark:text-terracotta-200',
  neutral: 'bg-muted text-muted-foreground',
};

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-forest-500 to-forest-700 text-white shadow-card sm:h-12 sm:w-12 sm:rounded-2xl">
          <Icon size={20} strokeWidth={2} />
        </div>
        <div className="min-w-0">
          <Text as="h1" variant="display" className="leading-tight [overflow-wrap:anywhere]">
            {title}
          </Text>
          <Text variant="body" tone="muted" className="mt-0.5">
            {description}
          </Text>
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  );
}

/** A row of KPI cards — four on a wide screen, two on a tablet or a phone. */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{children}</div>;
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'forest',
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-[132px] rounded-card" />;
  return (
    <Card className="flex min-w-0 flex-col gap-2 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <Text variant="label" tone="muted" className="min-w-0">
          {label}
        </Text>
        <div className={cn('hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex', TONE_CLASSES[tone])}>
          <Icon size={17} strokeWidth={2} />
        </div>
      </div>
      {/* Two to a row on a phone: a long amount wraps rather than overflowing its card. */}
      <p className="font-display text-[1.375rem] font-extrabold leading-none tracking-[-0.02em] tabular [overflow-wrap:anywhere] sm:text-[clamp(1.75rem,3vw,2.25rem)]">
        {value}
      </p>
      {hint && (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      )}
    </Card>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col gap-4 p-5', className)}>
      <div>
        <Text variant="subtitle">{title}</Text>
        {subtitle && (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        )}
      </div>
      {children}
    </Card>
  );
}

/** Bars over time — sign-ups per week, deliveries per day. */
export function BarSeries({
  data,
  format = (v) => String(v),
  color = CHART.forest,
  height = 180,
}: {
  data: { label: string; value: number }[];
  format?: (v: number) => string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A8175' }} axisLine={false} tickLine={false} minTickGap={12} />
        <Tooltip
          cursor={{ fill: 'rgba(53,135,92,0.12)' }}
          content={<ChartTooltip formatValue={(v) => format(v)} />}
        />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One stacked bar plus its legend — a distribution read at a glance. */
export function Breakdown({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) {
    return (
      <Text variant="body" tone="muted">
        Pas encore de données.
      </Text>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {items.map((item, i) =>
          item.value > 0 ? (
            <div
              key={item.label}
              title={`${item.label} : ${item.value}`}
              style={{ width: `${(item.value / total) * 100}%`, backgroundColor: SERIES[i % SERIES.length] }}
            />
          ) : null
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-sans text-[0.8125rem]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SERIES[i % SERIES.length] }} />
              {item.label}
            </span>
            <span className="font-sans text-[0.8125rem] tabular text-muted-foreground">
              {item.value} · {Math.round((item.value / total) * 100)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A top five — the bar behind each line is its share of the leader. */
export function Ranking({
  items,
  empty = 'Pas encore de données sur la période.',
}: {
  items: { id: string; label: string; value: number; display: string; href?: string }[];
  empty?: string;
}) {
  if (items.length === 0) {
    return (
      <Text variant="body" tone="muted">
        {empty}
      </Text>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((item, index) => {
        const row = (
          <div className="relative overflow-hidden rounded-lg px-3 py-2">
            <div className="absolute inset-y-0 left-0 bg-forest-600/10" style={{ width: `${(item.value / max) * 100}%` }} />
            <div className="relative flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="font-display text-[0.9375rem] font-bold text-muted-foreground">{index + 1}</span>
                <span className="truncate font-sans text-[0.875rem] font-semibold">{item.label}</span>
              </span>
              <span className="whitespace-nowrap font-sans text-[0.8125rem] tabular">{item.display}</span>
            </div>
          </div>
        );
        return <li key={item.id}>{item.href ? <Link href={item.href} className="block hover:opacity-80">{row}</Link> : row}</li>;
      })}
    </ol>
  );
}

const AVATAR_COLORS = [
  'bg-forest-100 text-forest-800 dark:bg-forest-900 dark:text-forest-100',
  'bg-mustard-100 text-mustard-900 dark:bg-mustard-900 dark:text-mustard-100',
  'bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-900 dark:text-terracotta-100',
];

/**
 * A person: their profile photo when they have set one, otherwise their
 * initials on a colour that stays the same for the same name.
 *
 * `src` is what the API returns — a Storage path or a full address. A photo
 * that will not load (deleted, or the network) falls back to the initials
 * rather than leaving a broken image.
 */
export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const url = mediaUrl(src);
  const [failed, setFailed] = useState(false);
  // A row reused for another person (a list re-sorted) gets a fresh try.
  useEffect(() => setFailed(false), [url]);

  if (url && !failed) {
    return (
      // Decorative: the name is always written beside it.
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full bg-muted object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-sans font-bold', AVATAR_COLORS[hash % AVATAR_COLORS.length])}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}
