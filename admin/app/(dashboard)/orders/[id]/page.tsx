'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Ban, MapPin, MessageCircleWarning, ReceiptText, Send, TriangleAlert, Undo2 } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/insights/Insights';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { cancelOrder, getOrder, getReceiptUrl, resendReceipt } from '@/lib/api/orders';
import { useAdmin } from '@/lib/permissions';
import {
  orderStatusMeta,
  CANCELLED_BY_LABELS,
  CANCEL_REASON_LABELS,
  COURIER_ISSUE_REASON_LABELS,
  DISPUTE_REASON_LABELS,
  RELEASE_REASON_LABELS,
} from '@/lib/statusMeta';
import { formatCad, formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { AdminOrderDetail } from '@/lib/types';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrderDetail | null | undefined>(undefined);
  const [openingReceipt, setOpeningReceipt] = useState(false);
  const [resending, setResending] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const toast = useToast();
  const { can } = useAdmin();

  async function openReceipt() {
    // The tab is opened before the request, while this is still the click: a
    // tab opened after an `await` is a pop-up, and browsers block those.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setOpeningReceipt(true);
    try {
      const url = await getReceiptUrl(id);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      toast('error', error instanceof Error ? error.message : t('orders.detail.receipt.openFailed'));
    } finally {
      setOpeningReceipt(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      const { sentAt } = await resendReceipt(id);
      setOrder((current) =>
        current ? { ...current, receipt: { number: current.receipt?.number ?? null, emailedAt: sentAt } } : current
      );
      toast('success', t('orders.detail.receipt.resent'));
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('orders.detail.receipt.sendFailed'));
    } finally {
      setResending(false);
    }
  }

  /**
   * Cancel the order, with the reason typed in the dialog. Whatever the answer,
   * the order is read again: a refusal usually means it moved (delivered, or
   * cancelled by someone else) and the page should show where it now stands.
   */
  async function cancel(reason?: string) {
    if (!reason) return;
    setCancelling(true);
    try {
      const outcome = await cancelOrder(id, reason);
      if (outcome.refund === 'failed') {
        toast('error', t('orders.detail.cancel.refundFailed'));
      } else if (outcome.refund === 'refunded') {
        toast('success', t('orders.detail.cancel.refunded', { amount: formatCad(outcome.refundAmountCad ?? 0) }));
      } else {
        toast('success', t('orders.detail.cancel.noRefund'));
      }
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('orders.detail.cancel.failed'));
    } finally {
      setConfirmingCancel(false);
      setCancelling(false);
      setOrder((await getOrder(id).catch(() => null)) ?? null);
    }
  }

  useEffect(() => {
    let active = true;
    // The vendor is embedded in the detail response now — this used to fire a
    // second, dependent request for the shop's name once the order arrived.
    getOrder(id)
      .then((o) => active && setOrder(o))
      // Null renders "introuvable"; without a rejection path a failed request
      // left the skeleton spinning forever.
      .catch(() => active && setOrder(null));
    return () => {
      active = false;
    };
  }, [id]);

  if (order === undefined) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (order === null) {
    return (
      <div className="mx-auto max-w-content">
        <Text variant="title">{t('orders.detail.notFound')}</Text>
      </div>
    );
  }

  const meta = orderStatusMeta(order.status);
  // Any step before delivery. A delivered order is refunded, not cancelled.
  const cancellable = order.status !== 'delivered' && order.status !== 'cancelled';
  const onTheRoad = order.status === 'out_for_delivery';

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: t('orders.list.title'), href: '/orders' }, { label: `#${order.id.slice(0, 8)}` }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Text as="h1" variant="display">
              {t('orders.detail.title', { id: order.id.slice(0, 8) })}
            </Text>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Avatar name={order.customerName ?? t('orders.roles.customer')} src={order.customer?.avatarUrl} size={26} />
            <Text variant="body" tone="muted">
              {order.customerName ?? t('orders.roles.customer')} · {order.vendor.name} · {formatDateTime(order.createdAt)}
            </Text>
          </div>
          {/* Absent against an API that predates receipts; the buttons still work without it. */}
          {order.receipt && (
            <Text variant="caption" tone="muted" className="mt-1">
              {order.receipt.number ? t('orders.detail.receipt.numbered', { number: order.receipt.number }) : t('orders.detail.receipt.label')} ·{' '}
              {order.receipt.emailedAt
                ? t('orders.detail.receipt.emailedOn', { date: formatDateTime(order.receipt.emailedAt) })
                : t('orders.detail.receipt.notEmailed')}
            </Text>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={openReceipt} disabled={openingReceipt}>
            <ReceiptText size={15} />
            {t('orders.detail.receipt.pdf')}
          </Button>
          <Button variant="outline" size="sm" onClick={resend} disabled={resending}>
            <Send size={15} />
            {resending ? t('orders.detail.receipt.sending') : t('orders.detail.receipt.resend')}
          </Button>
          {cancellable && can('orders.refund') && (
            <Button variant="outline" size="sm" className="border-destructive/50 text-destructive" onClick={() => setConfirmingCancel(true)}>
              <Ban size={15} />
              {t('orders.detail.cancel.action')}
            </Button>
          )}
        </div>
      </div>

      {order.status === 'cancelled' && (
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <Ban size={17} className="text-destructive" />
            <Text variant="subtitle">{CANCELLED_BY_LABELS[order.cancellation?.by ?? 'unknown']}</Text>
          </div>
          <dl className="flex flex-col gap-1.5 font-sans text-[0.875rem]">
            {order.cancellation?.at && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t('orders.detail.cancellation.on')}</dt>
                <dd>
                  {formatDateTime(order.cancellation.at)}
                  {order.cancellation.byName ? ` · ${order.cancellation.byName}` : ''}
                </dd>
              </div>
            )}
            {order.cancellation?.reason && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t('orders.detail.cancellation.reason')}</dt>
                <dd>{CANCEL_REASON_LABELS[order.cancellation.reason] ?? order.cancellation.reason}</dd>
              </div>
            )}
            {order.cancellation?.note && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{order.cancellation.by === 'admin' ? t('orders.detail.cancellation.reason') : t('orders.detail.cancellation.customerNote')}</dt>
                <dd className="whitespace-pre-wrap">{order.cancellation.note}</dd>
              </div>
            )}
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t('orders.detail.cancellation.refund')}</dt>
              <dd>
                {order.refund
                  ? t('orders.detail.cancellation.refundedOn', { amount: formatCad(order.refund.refundAmountCad ?? 0), date: formatDateTime(order.refund.refundedAt) })
                  : order.stripePaymentIntentId
                    ? t('orders.detail.cancellation.refundPending')
                    : t('orders.detail.cancellation.noCardPayment')}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Text variant="subtitle" className="mb-4">
            {t('orders.detail.items.title')}
          </Text>
          <div className="flex flex-col gap-3">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <Text variant="body" className="font-medium">
                    {item.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t('orders.detail.items.qtyPrice', { qty: item.qty, price: formatCad(item.unitPriceCad) })}
                  </Text>
                </div>
                <Text variant="body" className="tabular font-semibold">
                  {formatCad(item.lineTotalCad)}
                </Text>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4">
            <Row label={t('orders.detail.items.subtotal')} value={formatCad(order.totals.subtotalCad)} />
            <Row label={t('orders.detail.items.gst')} value={formatCad(order.totals.gstCad)} />
            <Row label={t('orders.detail.items.qst')} value={formatCad(order.totals.qstCad)} />
            <Row label={t('orders.detail.items.delivery')} value={formatCad(order.totals.deliveryFeeCad)} />
            <Row label={t('orders.detail.items.total')} value={formatCad(order.totals.totalCad)} strong />
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              {t('orders.detail.delivery.title')}
            </Text>
            <div className="flex items-start gap-2.5">
              <MapPin size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
              <Text variant="body">
                {order.deliveryAddress.street}, {order.deliveryAddress.city}
              </Text>
            </div>
            {order.deliveryInstructions && (
              <dl className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 font-sans text-[0.8125rem]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('orders.detail.delivery.dropoff')}</dt>
                  <dd className="font-semibold">{order.deliveryInstructions.dropoff === 'door' ? t('orders.detail.delivery.leaveAtDoor') : t('orders.detail.delivery.inPerson')}</dd>
                </div>
                {order.deliveryInstructions.unit && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('orders.detail.delivery.unit')}</dt>
                    <dd className="text-right">{order.deliveryInstructions.unit}</dd>
                  </div>
                )}
                {order.deliveryInstructions.doorCode && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('orders.detail.delivery.doorCode')}</dt>
                    <dd className="font-semibold tabular">{order.deliveryInstructions.doorCode}</dd>
                  </div>
                )}
                {order.deliveryInstructions.notes && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground">{t('orders.detail.delivery.instructions')}</dt>
                    <dd className="whitespace-pre-wrap">{order.deliveryInstructions.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </Card>

          <Card className="p-5">
            <Text variant="subtitle" className="mb-3">
              {t('orders.detail.statusHistory')}
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

      {order.releases && order.releases.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Undo2 size={17} className="text-muted-foreground" />
            <Text variant="subtitle">{t('orders.detail.releases.title')}</Text>
          </div>
          <ul className="flex flex-col">
            {order.releases.map((release, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2.5 last:border-0 last:pb-0">
                <div>
                  <Text variant="body" className="font-medium">
                    {release.courier ? (
                      <Link href={`/couriers/${release.courier.id}`} className="hover:underline">
                        {release.courier.fullName}
                      </Link>
                    ) : (
                      t('orders.detail.releases.deletedCourier')
                    )}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {release.note
                      ? t('orders.detail.releases.withNote', { summary: releaseSummary(release), note: release.note })
                      : releaseSummary(release)}
                  </Text>
                </div>
                <Text variant="caption" tone="muted">
                  {formatDateTime(release.releasedAt)}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {order.dispute && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <MessageCircleWarning size={17} className="text-destructive" />
            <Text variant="subtitle">{t('orders.detail.dispute.title', { reason: DISPUTE_REASON_LABELS[order.dispute.reason] ?? order.dispute.reason })}</Text>
          </div>
          <div className="flex flex-col gap-3">
            <ThreadMessage author={t('orders.roles.customer')} at={order.dispute.openedAt} message={order.dispute.message} />
            {order.dispute.merchantReply && (
              <ThreadMessage author={t('orders.roles.merchant')} at={order.dispute.answeredAt!} message={order.dispute.merchantReply} muted />
            )}
          </div>
          <Link href={`/disputes/dp_${order.id}`} className="mt-3 inline-block font-sans text-[0.8125rem] font-semibold text-primary hover:underline">
            {t('orders.detail.dispute.link')}
          </Link>
        </Card>
      )}

      {order.courierIssue && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <TriangleAlert size={17} className="text-destructive" />
            <Text variant="subtitle">{t('orders.detail.courierIssue.title', { reason: COURIER_ISSUE_REASON_LABELS[order.courierIssue.reason] ?? order.courierIssue.reason })}</Text>
          </div>
          <ThreadMessage author={t('orders.roles.courier')} at={order.courierIssue.at} message={order.courierIssue.message} />
          <Link href={`/courier-issues/ci_${order.id}`} className="mt-3 inline-block font-sans text-[0.8125rem] font-semibold text-primary hover:underline">
            {t('orders.detail.courierIssue.link')}
          </Link>
        </Card>
      )}

      <ConfirmDialog
        open={confirmingCancel}
        title={t('orders.detail.cancel.confirmTitle')}
        description={
          (order.stripePaymentIntentId
            ? t('orders.detail.cancel.willRefund', { amount: formatCad(order.totals.totalCad) })
            : t('orders.detail.cancel.nothingToRefund')) +
          (onTheRoad
            ? ` ${t('orders.detail.cancel.courierCarrying')}`
            : order.delivery
              ? ` ${t('orders.detail.cancel.courierAssigned')}`
              : '') +
          ` ${t('orders.detail.cancel.final')}`
        }
        confirmLabel={t('orders.detail.cancel.action')}
        tone="destructive"
        requireReason
        reasonLabel={t('orders.detail.cancel.reasonLabel')}
        busy={cancelling}
        onConfirm={cancel}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  );
}

/** What became of one courier's run — the sentence the note, if any, is attached to. */
function releaseSummary(release: NonNullable<AdminOrderDetail['releases']>[number]): string {
  return release.reason === 'order_cancelled'
    ? release.pickedUpAt
      ? t('orders.detail.releases.cancelledAfterPickup')
      : t('orders.detail.releases.cancelledEnRoute')
    : release.reason === 'no_show'
      ? t('orders.detail.releases.noShow')
      : t('orders.detail.releases.gaveBack', { reason: RELEASE_REASON_LABELS[release.reason] ?? release.reason });
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
