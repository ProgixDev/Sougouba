'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users as UsersIcon, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { listUsers } from '@/lib/api/users';
import { useToast } from '@/components/Toast';
import type { AdminUserListItem, UserRole } from '@/lib/types';

const ROLE_LABELS: Record<string, string> = { customer: 'Client', business: 'Commerçant', courier: 'Livreur', admin: 'Administrateur' };
const ROLE_TABS: { key: UserRole | 'all'; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'customer', label: 'Clients' },
  { key: 'business', label: 'Commerçants' },
  { key: 'courier', label: 'Livreurs' },
];

export default function UsersPage() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<AdminUserListItem[] | null>(null);
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [search, setSearch] = useState('');

  // Debounced — this reaches the network per keystroke now, and the /admin
  // budget is 120 requests a minute.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setRows(null);
    // Role and search filter server-side. Searching by email only works at all
    // because the API joins `auth.users` — `profiles` does not carry it.
    listUsers({ role: role === 'all' ? undefined : role, search: debouncedSearch })
      .then((items) => active && setRows(items))
      .catch((error: unknown) => {
        if (!active) return;
        setRows([]);
        toast('error', error instanceof Error ? error.message : 'Chargement impossible.');
      });
    return () => {
      active = false;
    };
  }, [role, debouncedSearch, toast]);

  const columns: Column<AdminUserListItem>[] = [
    {
      key: 'fullName',
      header: 'Nom',
      sortable: true,
      sortValue: (u) => u.fullName,
      render: (u) => (
        <Text variant="body" className="font-semibold">
          {u.fullName}
        </Text>
      ),
    },
    { key: 'email', header: 'Courriel', render: (u) => <Text variant="body" tone="muted">{u.email ?? '—'}</Text> },
    {
      key: 'role',
      header: 'Rôle',
      render: (u) => <Badge tone={u.role === 'business' ? 'secondary' : u.role === 'courier' ? 'primary' : 'neutral'}>{u.role ? ROLE_LABELS[u.role] : '—'}</Badge>,
    },
    {
      key: 'linked',
      header: 'Lié à',
      render: (u) => (
        <Text variant="caption" tone="muted">
          {u.vendorId ?? u.courierId ?? '—'}
        </Text>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Utilisateurs
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Annuaire des comptes clients, commerçants et livreurs.
        </Text>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 rounded-full border border-border bg-card p-1">
          {ROLE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRole(t.key)}
              className={`cursor-pointer rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
                role === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou un courriel…"
            className="w-56 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows ?? []}
          keyField={(u) => u.id}
          onRowClick={(u) => router.push(`/users/${u.id}`)}
          loading={rows === null}
          emptyIcon={UsersIcon}
          emptyTitle="Aucun utilisateur"
          emptyDescription="Aucun utilisateur ne correspond à ce filtre pour le moment."
        />
      </Card>
    </div>
  );
}
