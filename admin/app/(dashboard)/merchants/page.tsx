'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Store, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { listVendors } from '@/lib/api/vendors';
import { vendorStatusMeta } from '@/lib/statusMeta';
import { formatDate } from '@/lib/format';
import type { Vendor, VendorStatus } from '@/lib/types';

const TABS: { key: VendorStatus; label: string }[] = [
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Approuvés' },
  { key: 'suspended', label: 'Suspendus' },
];

export default function MerchantsPage() {
  const router = useRouter();
  const [all, setAll] = useState<Vendor[] | null>(null);
  const [tab, setTab] = useState<VendorStatus>('pending');
  const [search, setSearch] = useState('');

  useEffect(() => {
    listVendors().then(setAll);
  }, []);

  const counts = useMemo(() => {
    const base = { pending: 0, approved: 0, suspended: 0 };
    for (const v of all ?? []) base[v.status] += 1;
    return base;
  }, [all]);

  const rows = useMemo(() => {
    let list = (all ?? []).filter((v) => v.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((v) => v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q));
    }
    return list;
  }, [all, tab, search]);

  const columns: Column<Vendor>[] = [
    {
      key: 'name',
      header: 'Commerce',
      sortable: true,
      sortValue: (v) => v.name,
      render: (v) => (
        <div>
          <Text variant="body" className="font-semibold">
            {v.name}
          </Text>
          <Text variant="caption" tone="muted">
            {v.specialtyFr}
          </Text>
        </div>
      ),
    },
    {
      key: 'vendorType',
      header: 'Secteur',
      render: (v) => <Text variant="body">{v.vendorType === 'restaurant' ? 'Restaurant' : 'Épicerie'}</Text>,
    },
    { key: 'city', header: 'Ville', sortable: true, sortValue: (v) => v.city, render: (v) => <Text variant="body">{v.city}</Text> },
    {
      key: 'submitted',
      header: 'Soumis',
      sortable: true,
      sortValue: (v) => v.registration?.submittedAt ?? '',
      render: (v) => (
        <Text variant="body" tone="muted">
          {v.registration ? formatDate(v.registration.submittedAt) : '—'}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (v) => {
        const meta = vendorStatusMeta(v.status);
        return <StatusBadge label={meta.label} tone={meta.tone} />;
      },
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Commerçants
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          File d&apos;approbation et annuaire des boutiques.
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
            placeholder="Rechercher un commerce ou une ville…"
            className="w-56 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows}
          keyField={(v) => v.id}
          onRowClick={(v) => router.push(`/merchants/${v.id}`)}
          loading={all === null}
          emptyIcon={Store}
          emptyTitle="Aucun commerce"
          emptyDescription="Aucun commerce ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
