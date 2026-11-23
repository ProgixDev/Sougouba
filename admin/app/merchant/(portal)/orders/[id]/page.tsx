'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, MessageCircleWarning, TriangleAlert } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { getMerchantOrder } from '@/lib/api/merchantOrders';
import { orderStatusMeta, DISPUTE_REASON_LABELS, COURIER_ISSUE_REASON_LABELS } from '@/lib/statusMeta';
import { formatCad, formatDateTime } from '@/lib/format';
import type { Order } from '@/lib/types';

export default function MerchantOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => {
    // Scoped on the server: another shop's order answers 404, like a missing one.
    getMerchantOrder(id)
      .then((o) => setOrder(o ?? null))
      .catch(() => setOrder(null));
  }, [id]);

  if (order === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (order === null) {
    return <Text variant="title">Commande introuvable</Text>;
  }

  const meta = orderStatusMeta(order.status);

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Commandes', href: '/merchant/orders' }, { label: `#${order.id.slice(0, 8)}` }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Text as="h1" variant="display">
              Commande #{order.id.slice(0, 8)}
            </Text>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {order.customerName ?? 'Client'} · {formatDateTime(order.createdAt)}
          </Text>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Text variant="subtitle" className="mb-4">
            Articles
          </Text>
          <div className="flex flex-col gap-3">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <Text variant="body" className="font-medium">
                    {item.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    Qté {item.qty} × {formatCad(item.unitPriceCad)}
                  </Text>
                </div>
                <Text variant="body" className="tabular font-semibold">
                  {formatCad(item.qty * item.unitPriceCad)}
                </Text>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4">
            <Row label="Sous-total" value={formatCad(order.subtotalCad)} />
            <Row label="TPS" value={formatCad(order.gstCad)} />
            <Row label="TVQ" value={formatCad(order.qstCad)} />
            <Row label="Livraison" value={formatCad(order.deliveryFeeCad)} />
            <Row label="Total" value={formatCad(order.totalCad)} strong />
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              Livraison
            </Text>
            <div className="flex items-start gap-2.5">
              <MapPin size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
              <Text variant="body">
                {order.deliveryAddress.street}, {order.deliveryAddress.city}
              </Text>
            </div>
          </Card>

          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              Historique du statut
            </Text>
            <ol className="flex flex-col gap-3">
              {order.statusHistory.map((event, i) => {
                const m = orderStatusMeta(event.status);
                return (
                  <li key={i} className="flex items-center justify-between">
                    <StatusBadge label={m.label} tone={m.tone} />
                    <Text variant="caption" tone="muted">
                      {formatDateTime(event.at)}
                    </Text>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>

      {order.dispute && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <MessageCircleWarning size={17} className="text-destructive" />
            <Text variant="subtitle">Litige — {DISPUTE_REASON_LABELS[order.dispute.reason]}</Text>
          </div>
          <div className="flex flex-col gap-3">
            <ThreadMessage author="Client" at={order.dispute.openedAt} message={order.dispute.message} />
            {order.dispute.merchantReply && (
              <ThreadMessage author="Vous" at={order.dispute.answeredAt!} message={order.dispute.merchantReply} muted />
            )}
          </div>
          <Text variant="caption" tone="muted" className="mt-3">
            Ce litige est suivi par l&apos;équipe Sougouba — vous serez contacté si une réponse est requise.
          </Text>
        </Card>
      )}

      {order.courierIssue && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <TriangleAlert size={17} className="text-destructive" />
            <Text variant="subtitle">Incident livreur — {COURIER_ISSUE_REASON_LABELS[order.courierIssue.reason]}</Text>
          </div>
          <ThreadMessage author="Livreur" at={order.courierIssue.at} message={order.courierIssue.message} />
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Text variant="body" tone={strong ? 'default' : 'muted'} className={strong ? 'font-semibold' : ''}>
        {label}
      </Text>
      <Text variant="body" className={`tabular ${strong ? 'font-bold' : ''}`}>
        {value}
      </Text>
    </div>
  );
}

function ThreadMessage({ author, at, message, muted }: { author: string; at: string; message: string; muted?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${muted ? 'bg-muted' : 'bg-destructive/5'}`}>
      <div className="mb-1 flex items-center justify-between">
        <Text variant="label">{author}</Text>
        <Text variant="caption" tone="muted">
          {formatDateTime(at)}
        </Text>
      </div>
      <Text variant="body">{message}</Text>
    </div>
  );
}
