'use client';
import { useEffect, useState } from 'react';
import { DollarSign, Package, TrendingUp, Store, Bike, AlertCircle, LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/insights/Insights';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatCard } from '@/components/data/StatCard';
import { Skeleton } from '@/components/data/Skeleton';
import { TrendChart } from '@/components/charts/TrendChart';
import { CompareBarChart } from '@/components/charts/CompareBarChart';
import { getOverviewStats, type OverviewStats } from '@/lib/api/stats';
import { formatCad } from '@/lib/format';

const RANGES = [
  { label: '7 jours', value: 7 as const },
  { label: '30 jours', value: 30 as const },
  { label: '90 jours', value: 90 as const },
];

export default function OverviewPage() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [stats, setStats] = useState<OverviewStats | null>(null);

  useEffect(() => {
    let active = true;
    setStats(null);
    getOverviewStats(range).then((s) => {
      if (active) setStats(s);
    });
    return () => {
      active = false;
    };
  }, [range]);

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          icon={LayoutDashboard}
          title="Aperçu de la plateforme"
          description="L’activité, les revenus et les files d’attente, en un coup d’œil."
        />
        <div className="flex gap-1.5 rounded-full border border-border bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
                range === r.value ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[122px] rounded-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="GMV" value={formatCad(stats.gmvCad)} icon={DollarSign} deltaPct={stats.gmvDeltaPct} tint="forest" />
            <StatCard label="Commandes" value={String(stats.orderCount)} icon={Package} deltaPct={stats.orderDeltaPct} tint="terracotta" />
            <StatCard label="Revenu de commission" value={formatCad(stats.commissionRevenueCad)} icon={TrendingUp} tint="mustard" />
            <StatCard label="Commerçants approuvés" value={String(stats.activeMerchants)} icon={Store} tint="forest" />
            <StatCard label="Livreurs approuvés" value={String(stats.activeCouriers)} icon={Bike} tint="terracotta" />
            <StatCard
              label="En attente d'approbation"
              value={String(stats.pendingMerchants + stats.pendingCouriers)}
              icon={AlertCircle}
              tint="mustard"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="p-5 lg:col-span-3">
              <Text variant="subtitle" className="mb-4">
                GMV dans le temps
              </Text>
              <TrendChart data={stats.series} />
            </Card>
            <Card className="p-5 lg:col-span-2">
              <Text variant="subtitle" className="mb-4">
                Meilleurs commerçants (revenu)
              </Text>
              <CompareBarChart data={stats.topVendors.map((v) => ({ name: v.name, revenueCad: v.revenueCad }))} />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <Text variant="subtitle" className="mb-3">
                Litiges &amp; incidents ouverts
              </Text>
              <div className="flex gap-6">
                <div>
                  <Text variant="display" as="p" className="tabular">
                    {stats.openDisputes}
                  </Text>
                  <Text variant="caption" tone="muted">
                    Litiges clients
                  </Text>
                </div>
                <div>
                  <Text variant="display" as="p" className="tabular">
                    {stats.openCourierIssues}
                  </Text>
                  <Text variant="caption" tone="muted">
                    Incidents livreurs
                  </Text>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <Text variant="subtitle" className="mb-3">
                Commandes par secteur
              </Text>
              <div className="flex gap-6">
                {stats.ordersByVertical.map((v) => (
                  <div key={v.vertical}>
                    <Text variant="display" as="p" className="tabular">
                      {v.orders}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {v.vertical}
                    </Text>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
