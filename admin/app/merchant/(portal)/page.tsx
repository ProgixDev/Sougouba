'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Clock, DollarSign, LayoutDashboard, Package, ShoppingBag } from 'lucide-react';
import { KpiCard, KpiGrid, PageHeader } from '@/components/insights/Insights';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { TrendChart } from '@/components/charts/TrendChart';
import { getVendorOverview, type VendorOverviewStats } from '@/lib/api/stats';
import { listMerchantOrders } from '@/lib/api/merchantOrders';
import { orderStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDateTime } from '@/lib/format';
import { t, lazy, useLocale } from '@/lib/i18n';
import type { Order } from '@/lib/types';

const RANGES = lazy(() => ([
  { label: t('portal.overview.rangeDays', { count: 7 }), value: 7 as const },
  { label: t('portal.overview.rangeDays', { count: 30 }), value: 30 as const },
  { label: t('portal.overview.rangeDays', { count: 90 }), value: 90 as const },
]));

/**
 * The shop at a glance — laid out like the back office's own overview: the
 * period, the figures, the trend, then what came in last.
 */
export default function MerchantOverviewPage() {
  useLocale();
  const router = useRouter();
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [stats, setStats] = useState<VendorOverviewStats | null>(null);
  const [recent, setRecent] = useState<Order[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setStats(null);
    // The shop comes from the session's token on the server — nothing to pass.
    getVendorOverview(range)
      .then((s) => active && setStats(s))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [range]);

  useEffect(() => {
    listMerchantOrders({}, { offset: 0, limit: 6 })
      .then((page) => setRecent(page.items))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader icon={LayoutDashboard} title={t('portal.overview.title')} description={t('portal.overview.description')} />
        <div className="flex gap-1.5 rounded-full border border-border bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              aria-pressed={range === r.value}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
                range === r.value ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <Text variant="body" tone="destructive">
          {t('portal.overview.loadFailed')}
        </Text>
      ) : null}

      <KpiGrid>
        <KpiCard
          loading={!stats}
          icon={DollarSign}
          label={t('portal.overview.kpi.sales')}
          value={formatCad(stats?.revenueCad ?? 0)}
          hint={t('portal.overview.kpi.salesHint')}
        />
        <KpiCard
          loading={!stats}
          icon={Package}
          tone="terracotta"
          label={t('portal.overview.kpi.orders')}
          value={String(stats?.orderCount ?? 0)}
          hint={t('portal.overview.kpi.ordersHint', { days: range })}
        />
        <KpiCard
          loading={!stats}
          icon={ShoppingBag}
          tone="neutral"
          label={t('portal.overview.kpi.basket')}
          value={formatCad(stats && stats.orderCount > 0 ? stats.revenueCad / stats.orderCount : 0)}
          hint={t('portal.overview.kpi.basketHint')}
        />
        <KpiCard
          loading={!stats}
          icon={Clock}
          tone="mustard"
          label={t('portal.overview.kpi.active')}
          value={String(stats?.activeCount ?? 0)}
          hint={t('portal.overview.kpi.activeHint')}
        />
      </KpiGrid>

      {!stats ? (
        <Skeleton className="h-[320px] rounded-card" />
      ) : (
        <>
          <Card className="p-5">
            <Text variant="subtitle" className="mb-4">
              {t('portal.overview.trendTitle')}
            </Text>
            <TrendChart data={stats.series} />
          </Card>
        </>
      )}

      <Card elevated>
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <Text variant="subtitle">{t('portal.overview.recent.title')}</Text>
          <Link
            href="/merchant/orders"
            className="inline-flex items-center gap-1 font-sans text-[0.8125rem] font-semibold text-muted-foreground hover:text-foreground"
          >
            {t('portal.overview.recent.all')} <ChevronRight size={14} />
          </Link>
        </div>
        {recent === null ? (
          <div className="p-5">
            <Skeleton className="h-32" />
          </div>
        ) : recent.length === 0 ? (
          <Text variant="body" tone="muted" className="p-5">
            {t('portal.overview.recent.empty')}
          </Text>
        ) : (
          <div className="flex flex-col">
            {recent.map((o) => {
              const meta = orderStatusMeta(o.status);
              return (
                <button
                  key={o.id}
                  onClick={() => router.push(`/merchant/orders/${o.id}`)}
                  className="flex cursor-pointer items-center justify-between gap-3 border-b border-border px-5 py-3.5 text-left last:border-0 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <Text variant="body" className="truncate font-semibold">
                      #{o.id.slice(0, 8)} · {o.customerName ?? '—'}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDateTime(o.createdAt)}
                    </Text>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Text variant="body" className="tabular font-semibold">
                      {formatCad(o.totalCad)}
                    </Text>
                    <StatusBadge label={meta.label} tone={meta.tone} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
