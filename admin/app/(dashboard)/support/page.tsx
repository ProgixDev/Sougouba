'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headset } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/data/DataTable';
import { useToast } from '@/components/Toast';
import { listSupport, type SupportInboxItem } from '@/lib/api/support';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 50;

const TABS: { key: 'escalated' | 'closed' | 'all'; label: string }[] = [
  { key: 'escalated', label: 'À traiter' },
  { key: 'closed', label: 'Résolues' },
  { key: 'all', label: 'Toutes' },
];

const ROLE_PREFIX: Record<string, string> = { user: 'Client', assistant: 'Assistant', agent: 'Équipe', system: '' };

/**
 * Conversations customers handed from the support assistant to the team.
 *
 * "À traiter" lists the escalated ones with the oldest activity first, so a
 * customer who has waited longest is at the top. Assistant-only conversations
 * never appear here: nobody asked for a person.
 */
export default function SupportInboxPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('escalated');
  const [rows, setRows] = useState<SupportInboxItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    setRows(null);
    listSupport(tab)
      .then((page) => {
        if (!active) return;
        setRows(page.items);
        setTotal(page.total);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRows([]);
        toast('error', error instanceof Error ? error.message : 'Chargement impossible.');
      });
    return () => {
      active = false;
    };
  }, [tab, toast]);

  async function loadMore() {
    if (!rows) return;
    setLoadingMore(true);
    try {
      const page = await listSupport(tab, rows.length, PAGE_SIZE);
      setRows([...rows, ...page.items]);
      setTotal(page.total);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Chargement impossible.');
    }
    setLoadingMore(false);
  }

  const columns: Column<SupportInboxItem>[] = [
    {
      key: 'customer',
      header: 'Client',
      render: (c) => (
        <Text variant="body" className="font-semibold">
          {c.customer.fullName ?? 'Client'}
        </Text>
      ),
    },
    {
      key: 'last',
      header: 'Dernier message',
      render: (c) =>
        c.lastMessage ? (
          <Text variant="body" tone="muted" className="line-clamp-2 max-w-md">
            {ROLE_PREFIX[c.lastMessage.role] ? `${ROLE_PREFIX[c.lastMessage.role]} : ` : ''}
            {c.lastMessage.preview}
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            Aucun message pour l’instant
          </Text>
        ),
    },
    {
      key: 'lastMessageAt',
      header: 'Activité',
      render: (c) => (
        <Text variant="body" tone="muted" className="whitespace-nowrap">
          {formatDateTime(c.lastMessageAt)}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (c) =>
        c.status === 'closed' ? (
          <Badge tone="neutral">Résolue</Badge>
        ) : c.awaitingTeam ? (
          <Badge tone="destructive">Réponse attendue</Badge>
        ) : (
          <Badge tone="primary">Répondue</Badge>
        ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Support
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Les conversations que des clients ont transmises de l’assistant à l’équipe. Votre réponse arrive dans leur
          conversation, avec une notification.
        </Text>
      </div>

      <div className="flex gap-1.5 self-start rounded-full border border-border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`cursor-pointer rounded-full px-4 py-1.5 font-sans text-[0.8125rem] font-semibold transition-colors ${
              tab === t.key ? 'bg-forest-600 text-white' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card elevated>
        <DataTable
          columns={columns}
          rows={rows ?? []}
          keyField={(c) => c.id}
          onRowClick={(c) => router.push(`/support/${c.id}`)}
          loading={rows === null}
          emptyIcon={Headset}
          emptyTitle={tab === 'escalated' ? 'Aucune conversation en attente' : 'Aucune conversation'}
          emptyDescription={
            tab === 'escalated'
              ? 'Quand un client demande à parler à l’équipe, sa conversation apparaît ici.'
              : 'Aucune conversation ne correspond à ce filtre.'
          }
        />
      </Card>

      {rows && rows.length < total && (
        <div className="flex items-center justify-center gap-3">
          <Text variant="caption" tone="muted">
            {rows.length} sur {total}
          </Text>
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Chargement…' : 'Afficher plus'}
          </Button>
        </div>
      )}
    </div>
  );
}
