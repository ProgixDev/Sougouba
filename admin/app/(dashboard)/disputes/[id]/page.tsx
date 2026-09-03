'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { getDispute, resolveDispute } from '@/lib/api/disputes';
import { disputeStatusMeta, DISPUTE_REASON_LABELS } from '@/lib/statusMeta';
import { formatDateTime } from '@/lib/format';
import type { AdminDispute } from '@/lib/types';

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [dispute, setDispute] = useState<AdminDispute | null | undefined>(undefined);
  const [dialog, setDialog] = useState<'resolved' | 'rejected' | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setDispute((await getDispute(id)) ?? null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (dispute === undefined) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (dispute === null) {
    return (
      <div className="mx-auto max-w-content">
        <Text variant="title">Litige introuvable</Text>
      </div>
    );
  }

  const meta = disputeStatusMeta(dispute.status);
  const settled = dispute.status === 'resolved' || dispute.status === 'rejected';

  async function handleResolve(note?: string) {
    setBusy(true);
    await resolveDispute(dispute!.orderId, note ?? '', dialog!);
    setBusy(false);
    setDialog(null);
    toast('success', `Litige marqué comme ${dialog === 'resolved' ? 'résolu' : 'rejeté'}.`);
    load();
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Litiges', href: '/disputes' }, { label: `#${dispute.orderId.slice(0, 8)}` }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Text as="h1" variant="display">
              Litige — {DISPUTE_REASON_LABELS[dispute.reason]}
            </Text>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {dispute.customerName} · {dispute.vendorName} ·{' '}
            <Link href={`/orders/${dispute.orderId}`} className="text-primary hover:underline">
              Commande #{dispute.orderId}
            </Link>
          </Text>
        </div>
        {!settled && (
          <div className="flex gap-2.5">
            <Button variant="primary" onClick={() => setDialog('resolved')} disabled={busy}>
              <CheckCircle2 size={16} /> Marquer résolu
            </Button>
            <Button variant="outline" onClick={() => setDialog('rejected')} disabled={busy}>
              <XCircle size={16} /> Rejeter la réclamation
            </Button>
          </div>
        )}
      </div>

      <Card className="p-5">
        <Text variant="subtitle" className="mb-4">
          Fil de la réclamation
        </Text>
        <div className="flex flex-col gap-3">
          <ThreadMessage author="Client" at={dispute.openedAt} message={dispute.message} />
          {dispute.merchantReply && <ThreadMessage author="Commerçant" at={dispute.answeredAt!} message={dispute.merchantReply} muted />}
          {settled && dispute.merchantReply && (
            <ThreadMessage author="Administrateur — décision" at={dispute.resolvedAt!} message={dispute.merchantReply} accent />
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog === 'resolved' ? 'Marquer ce litige comme résolu ?' : 'Rejeter cette réclamation ?'}
        description="Ajoutez une note de décision — elle reste dans le dossier de la commande pour référence."
        confirmLabel={dialog === 'resolved' ? 'Marquer résolu' : 'Rejeter'}
        tone={dialog === 'resolved' ? 'primary' : 'destructive'}
        requireReason
        reasonLabel="Note de décision"
        busy={busy}
        onConfirm={handleResolve}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

function ThreadMessage({ author, at, message, muted, accent }: { author: string; at: string; message: string; muted?: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${accent ? 'bg-forest-50 dark:bg-forest-950' : muted ? 'bg-muted' : 'bg-destructive/5'}`}>
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
