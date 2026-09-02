'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Package, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatCard } from '@/components/data/StatCard';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { TrendChart } from '@/components/charts/TrendChart';
import { getVendorOverview, type VendorOverviewStats } from '@/lib/api/stats';
import { listOrders } from '@/lib/api/orders';
import { getMerchantSession } from '@/lib/merchantAuth';
import { orderStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDateTime } from '@/lib/format';
import type { Order } from '@/lib/types';

export default function MerchantOverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<VendorOverviewStats | null>(null);
  const [recent, setRecent] = useState<Order[] | null>(null);

  useEffect(() => {
    const session = getMerchantSession();
    if (!session) return;
    getVendorOverview(session.vendorId, 30).then(setStats);
    listOrders({ vendorId: session.vendorId }).then((orders) => setRecent(orders.slice(0, 6)));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Aperçu de votre boutique
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Vos commandes des 30 derniers jours.
        </Text>
      </div>

      {!stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[122px] rounded-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Revenu" value={formatCad(stats.revenueCad)} icon={DollarSign} tint="forest" />
            <StatCard label="Commandes" value={String(stats.orderCount)} icon={Package} tint="terracotta" />
            <StatCard label="En cours" value={String(stats.activeCount)} icon={Clock} tint="mustard" />
          </div>

          <Card className="p-5">
            <Text variant="subtitle" className="mb-4">
              Revenu dans le temps
            </Text>
            <TrendChart data={stats.series} />
          </Card>
        </>
      )}

      <Card elevated>
        <div className="flex items-center justify-between border-b border-border p-5">
          <Text variant="subtitle">Commandes récentes</Text>
        </div>
        {recent === null ? (
          <div className="p-5">
            <Skeleton className="h-32" />
          </div>
        ) : recent.length === 0 ? (
          <Text variant="body" tone="muted" className="p-5">
            Aucune commande pour le moment.
          </Text>
        ) : (
          <div className="flex flex-col">
            {recent.map((o) => {
              const meta = orderStatusMeta(o.status);
              return (
                <button
                  key={o.id}
                  onClick={() => router.push(`/merchant/orders/${o.id}`)}
                  className="flex cursor-pointer items-center justify-between border-b border-border px-5 py-3.5 text-left last:border-0 hover:bg-muted"
                >
                  <div>
                    <Text variant="body" className="font-semibold">
                      #{o.id} · {o.customerName ?? '—'}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDateTime(o.createdAt)}
                    </Text>
                  </div>
                  <div className="flex items-center gap-3">
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
