'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { getCourierIssue, resolveCourierIssue } from '@/lib/api/courierIssues';
import { courierIssueStatusMeta, COURIER_ISSUE_REASON_LABELS } from '@/lib/statusMeta';
import { formatDateTime } from '@/lib/format';
import type { AdminCourierIssue } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';

export default function CourierIssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
  const toast = useToast();
  const [issue, setIssue] = useState<AdminCourierIssue | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);

  async function load() {
    setIssue((await getCourierIssue(id)) ?? null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (issue === undefined) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (issue === null) {
    return (
      <div className="mx-auto max-w-content">
        <Text variant="title">Incident introuvable</Text>
      </div>
    );
  }

  const meta = courierIssueStatusMeta(issue.status);

  async function handleResolve(note?: string) {
    setBusy(true);
    // The note is mandatory server-side (min 5 chars) and is appended to the
    // report, so whoever reads it later sees what was actually done. The mock's
    // version recorded nothing at all.
    await resolveCourierIssue(issue!.orderId, note ?? '');
    setBusy(false);
    setDialog(false);
    toast('success', 'Incident marqué comme résolu.');
    load();
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Incidents livreurs', href: '/courier-issues' }, { label: `#${issue.orderId.slice(0, 8)}` }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Text as="h1" variant="display">
              Incident — {COURIER_ISSUE_REASON_LABELS[issue.reason]}
            </Text>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {issue.courierName ?? 'Livreur non assigné'} · {issue.vendorName} ·{' '}
            <Link href={`/orders/${issue.orderId}`} className="text-primary hover:underline">
              Commande #{issue.orderId.slice(0, 8)}
            </Link>
          </Text>
        </div>
        {issue.status === 'open' && can('courier_issues.resolve') && (
          <Button variant="primary" onClick={() => setDialog(true)} disabled={busy}>
            <CheckCircle2 size={16} /> Marquer résolu
          </Button>
        )}
      </div>

      <Card className="p-5">
        <Text variant="subtitle" className="mb-3">
          Rapport du livreur
        </Text>
        <div className="rounded-lg bg-destructive/5 p-3">
          <div className="mb-1 flex items-center justify-between">
            <Text variant="label">{issue.courierName ?? 'Livreur non assigné'}</Text>
            <Text variant="caption" tone="muted">
              {formatDateTime(issue.at)}
            </Text>
          </div>
          <Text variant="body">{issue.message}</Text>
        </div>
        {issue.status === 'resolved' && issue.resolvedAt && (
          <Text variant="caption" tone="muted" className="mt-3">
            Résolu le {formatDateTime(issue.resolvedAt)}
          </Text>
        )}
      </Card>
      <ConfirmDialog
        open={dialog}
        title="Marquer cet incident comme résolu ?"
        description="Expliquez ce qui a été fait — la note est ajoutée au rapport et reste consultable."
        confirmLabel="Marquer résolu"
        tone="primary"
        requireReason
        reasonLabel="Note de résolution"
        busy={busy}
        onConfirm={handleResolve}
        onCancel={() => setDialog(false)}
      />
    </div>
  );
}
