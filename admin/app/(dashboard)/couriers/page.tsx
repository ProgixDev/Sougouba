'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bike, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { listCouriers } from '@/lib/api/couriers';
import { courierStatusMeta, VEHICLE_LABELS } from '@/lib/statusMeta';
import { formatDate } from '@/lib/format';
import type { Courier, CourierStatus } from '@/lib/types';

const TABS: { key: CourierStatus; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Approuvés' },
  { key: 'suspended', label: 'Suspendus' },
];

export default function CouriersPage() {
  const router = useRouter();
  const [all, setAll] = useState<Courier[] | null>(null);
  const [tab, setTab] = useState<CourierStatus>('pending');
  const [search, setSearch] = useState('');

  useEffect(() => {
    listCouriers().then(setAll);
  }, []);

  const counts = useMemo(() => {
    const base = { pending: 0, approved: 0, suspended: 0 };
    for (const c of all ?? []) base[c.status] += 1;
    return base;
  }, [all]);

  const rows = useMemo(() => {
    let list = (all ?? []).filter((c) => c.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.fullName.toLowerCase().includes(q) || c.city.toLowerCase().includes(q));
    }
    return list;
  }, [all, tab, search]);

  const columns: Column<Courier>[] = [
    {
      key: 'fullName',
      header: 'Livreur',
      sortable: true,
      sortValue: (c) => c.fullName,
      render: (c) => (
        <Text variant="body" className="font-semibold">
          {c.fullName}
        </Text>
      ),
    },
    { key: 'vehicle', header: 'Véhicule', render: (c) => <Text variant="body">{VEHICLE_LABELS[c.vehicle]}</Text> },
    { key: 'city', header: 'Ville', sortable: true, sortValue: (c) => c.city, render: (c) => <Text variant="body">{c.city}</Text> },
    {
      key: 'joinedAt',
      header: 'Inscrit',
      sortable: true,
      sortValue: (c) => c.joinedAt,
      render: (c) => (
        <Text variant="body" tone="muted">
          {formatDate(c.joinedAt)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (c) => {
        const meta = courierStatusMeta(c.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Livreurs
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          File d&apos;approbation et annuaire des livreurs.
        </Text>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-full border border-border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`cursor-pointer rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
                tab === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un livreur ou une ville…"
            className="w-56 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows}
          keyField={(c) => c.id}
          onRowClick={(c) => router.push(`/couriers/${c.id}`)}
          loading={all === null}
          emptyIcon={Bike}
          emptyTitle="Aucun livreur"
          emptyDescription="Aucun livreur ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
