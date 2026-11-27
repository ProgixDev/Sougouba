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
import { t } from '@/lib/i18n';
import type { AdminDispute } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
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
        <Text variant="title">{t('disputes.detail.notFound')}</Text>
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
    toast('success', dialog === 'resolved' ? t('disputes.detail.toast.resolved') : t('disputes.detail.toast.rejected'));
    load();
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: t('disputes.list.title'), href: '/disputes' }, { label: `#${dispute.orderId.slice(0, 8)}` }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Text as="h1" variant="display">
              {t('disputes.detail.title', { reason: DISPUTE_REASON_LABELS[dispute.reason] ?? dispute.reason })}
            </Text>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {dispute.customerName} · {dispute.vendorName} ·{' '}
            <Link href={`/orders/${dispute.orderId}`} className="text-primary hover:underline">
              {t('disputes.detail.orderLink', { id: dispute.orderId })}
            </Link>
          </Text>
        </div>
        {!settled && can('disputes.resolve') && (
          <div className="flex flex-wrap gap-2.5">
            <Button variant="primary" onClick={() => setDialog('resolved')} disabled={busy}>
              <CheckCircle2 size={16} /> {t('disputes.detail.markResolved')}
            </Button>
            <Button variant="outline" onClick={() => setDialog('rejected')} disabled={busy}>
              <XCircle size={16} /> {t('disputes.detail.rejectClaim')}
            </Button>
          </div>
        )}
      </div>

      <Card className="p-5">
        <Text variant="subtitle" className="mb-4">
          {t('disputes.detail.thread.title')}
        </Text>
        <div className="flex flex-col gap-3">
          <ThreadMessage author={t('disputes.detail.thread.customer')} at={dispute.openedAt} message={dispute.message} />
          {dispute.merchantReply && <ThreadMessage author={t('disputes.detail.thread.merchant')} at={dispute.answeredAt!} message={dispute.merchantReply} muted />}
          {settled && dispute.merchantReply && (
            <ThreadMessage author={t('disputes.detail.thread.adminDecision')} at={dispute.resolvedAt!} message={dispute.merchantReply} accent />
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog === 'resolved' ? t('disputes.detail.confirm.resolveTitle') : t('disputes.detail.confirm.rejectTitle')}
        description={t('disputes.detail.confirm.description')}
        confirmLabel={dialog === 'resolved' ? t('disputes.detail.markResolved') : t('disputes.detail.confirm.reject')}
        tone={dialog === 'resolved' ? 'primary' : 'destructive'}
        requireReason
        reasonLabel={t('disputes.detail.confirm.noteLabel')}
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
