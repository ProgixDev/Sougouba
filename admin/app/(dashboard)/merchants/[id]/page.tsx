'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Ban, MapPin, Phone, FileText, Star, ExternalLink, Landmark, CreditCard } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/insights/Insights';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { getVendor, approveVendor, rejectVendor, suspendVendor } from '@/lib/api/vendors';
import { getStatementUrl, listVendorStatements, statementMonth, type Statement } from '@/lib/api/statements';
import { MERCHANT_ACCOUNT_LABELS, getMerchantAccountState, type MerchantAccountState } from '@/lib/api/payouts';
import { vendorStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDate } from '@/lib/format';
import { t, lazy, useLocale } from '@/lib/i18n';
import type { AdminVendorDetail } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';

export default function MerchantDetailPage() {
  useLocale();
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
  const toast = useToast();

  const [vendor, setVendor] = useState<AdminVendorDetail | null | undefined>(undefined);
  const [dialog, setDialog] = useState<'reject' | 'suspend' | null>(null);
  const [busy, setBusy] = useState(false);
  // Null while unread or unavailable: the card is simply not shown.
  const [statements, setStatements] = useState<Statement[] | null>(null);
  /** `undefined` while it loads; `null` when the API could not be asked at all. */
  const [payoutState, setPayoutState] = useState<MerchantAccountState | null | undefined>(undefined);

  async function openStatement(statement: Statement) {
    // Opened before the request, while this is still the click — see the order page.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await getStatementUrl(statement.id);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      toast('error', error instanceof Error ? error.message : t('merchants.detail.statements.openFailed'));
    }
  }

  async function load() {
    // One request, not two. The rejection/suspension reason used to live in a
    // separate localStorage map (`getVendorNote`); it is `statusReason` on the
    // row now.
    try {
      setVendor(await getVendor(id));
    } catch {
      setVendor(null);
    }
  }

  useEffect(() => {
    load();
    // Independent of the shop itself: an API older than statements answers 404,
    // and that must not blank the page.
    listVendorStatements(id)
      .then(setStatements)
      .catch(() => setStatements(null));
    // Likewise on its own: Stripe being slow must not hold up the shop's file.
    getMerchantAccountState(id)
      .then(setPayoutState)
      .catch(() => setPayoutState(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (vendor === undefined) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (vendor === null) {
    return (
      <div className="mx-auto max-w-content">
        <Text variant="title">{t('merchants.detail.notFound')}</Text>
      </div>
    );
  }

  const meta = vendorStatusMeta(vendor.status);
  // What the payouts field shows: « … » while Stripe is still being asked.
  const payoutAccount = payoutState === undefined ? '…' : MERCHANT_ACCOUNT_LABELS[payoutState ?? 'unavailable'];

  async function handleApprove() {
    setBusy(true);
    try {
      await approveVendor(vendor!.id);
      toast('success', t('merchants.detail.toasts.approved', { name: vendor!.name }));
    } catch (error) {
      // A 400 here usually means another administrator decided this file while
      // it was open — refetching shows the decision rather than an error the
      // reviewer can do nothing about.
      toast('error', error instanceof Error ? error.message : t('merchants.detail.toasts.failed'));
    }
    setBusy(false);
    load();
  }

  /**
   * Reject and suspend are genuinely different calls now. The mock sent both to
   * `rejectVendor`, which set `suspended` either way — so a refused application
   * and a shop pulled from the platform were indistinguishable afterwards.
   */
  async function handleDecision(reason?: string) {
    const rejecting = dialog === 'reject';
    setBusy(true);
    try {
      await (rejecting ? rejectVendor(vendor!.id, reason ?? '') : suspendVendor(vendor!.id, reason ?? ''));
      toast('info', t(rejecting ? 'merchants.detail.toasts.rejected' : 'merchants.detail.toasts.suspended', { name: vendor!.name }));
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('merchants.detail.toasts.failed'));
    }
    setBusy(false);
    setDialog(null);
    load();
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: t('merchants.list.title'), href: '/merchants' }, { label: vendor.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Text as="h1" variant="display">
              {vendor.name}
            </Text>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {/* `specialtyFr`, not the mobile app's `specialty.fr`: this is the
                API's admin shape, which carries the column as it is stored. */}
            {vendor.specialtyFr} ·{' '}
            {vendor.vendorType === 'restaurant' ? t('common.vendorType.restaurant') : t('common.vendorType.grocery')}
          </Text>
          {/* Who runs it — their account is one click away. */}
          {vendor.owner && (
            <Link href={`/users/${vendor.owner.id}`} className="mt-2.5 inline-flex items-center gap-2 hover:opacity-80">
              <Avatar name={vendor.owner.fullName || '?'} src={vendor.owner.avatarUrl} size={26} />
              <Text variant="body" tone="muted">
                {vendor.owner.fullName || t('merchants.detail.owner')}
                {vendor.owner.email ? ` · ${vendor.owner.email}` : ''}
              </Text>
            </Link>
          )}
        </div>
        {can('vendors.decide') && (
        <div className="flex flex-wrap gap-2.5">
          {/* Not for a shop offline for its subscription: the payment brings it back, not an administrator. */}
          {(vendor.status === 'pending' || vendor.status === 'suspended') && (
            <Button variant="primary" onClick={handleApprove} disabled={busy}>
              <CheckCircle2 size={16} /> {t('merchants.detail.actions.approve')}
            </Button>
          )}
          {vendor.status === 'pending' && (
            <Button variant="destructive" onClick={() => setDialog('reject')} disabled={busy}>
              <XCircle size={16} /> {t('merchants.detail.actions.reject')}
            </Button>
          )}
          {(vendor.status === 'approved' || vendor.status === 'subscription_hold') && (
            <Button variant="destructive" onClick={() => setDialog('suspend')} disabled={busy}>
              <Ban size={16} /> {t('merchants.detail.actions.suspend')}
            </Button>
          )}
        </div>
        )}
      </div>

      {vendor.status === 'subscription_hold' ? (
        <Card elevated={false} className="border-mustard-500/40 bg-mustard-50 p-4 dark:bg-mustard-950">
          <Text variant="label">{t('merchants.detail.subscriptionHold.title')}</Text>
          <Text variant="body" className="mt-1">
            {t('merchants.detail.subscriptionHold.body')}
          </Text>
        </Card>
      ) : (
        vendor.status === 'approved' &&
        vendor.subscription?.offlineAt && (
          <Card elevated={false} className="border-mustard-500/40 bg-mustard-50 p-4 dark:bg-mustard-950">
            <Text variant="label">{t('merchants.detail.subscriptionHold.graceTitle')}</Text>
            <Text variant="body" className="mt-1">
              {t('merchants.detail.subscriptionHold.graceBody', { date: formatDate(vendor.subscription.offlineAt) })}
            </Text>
          </Card>
        )
      )}

      {vendor.statusReason && (
        <Card elevated={false} className="border-destructive/30 bg-destructive/5 p-4">
          <Text variant="label" tone="destructive">
            {t('merchants.detail.statusReason')}
          </Text>
          <Text variant="body" className="mt-1">
            {vendor.statusReason}
          </Text>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Text variant="subtitle" className="mb-4">
            {t('merchants.detail.registration.title')}
          </Text>
          {vendor.registration ? (
            <div className="flex flex-col gap-6">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {vendor.registration.legalName && <Field label={t('merchants.detail.registration.legalName')} value={vendor.registration.legalName} icon={FileText} />}
                <Field label={t('merchants.detail.registration.neq')} value={vendor.registration.neq ?? t('merchants.detail.registration.neqMissing')} icon={FileText} />
                {vendor.registration.gstNumber && <Field label={t('merchants.detail.registration.gst')} value={vendor.registration.gstNumber} icon={FileText} />}
                {vendor.registration.qstNumber && <Field label={t('merchants.detail.registration.qst')} value={vendor.registration.qstNumber} icon={FileText} />}
                {vendor.registration.mapaqNumber && <Field label={t('merchants.detail.registration.mapaq')} value={vendor.registration.mapaqNumber} icon={FileText} />}
                {vendor.registration.mapaqExpiresOn && (
                  <Field
                    label={t('merchants.detail.registration.mapaqExpiry')}
                    // Checked at review time, not only at submission: a file can
                    // sit in the queue past the date it was valid on.
                    value={
                      vendor.registration.mapaqExpiresOn <= new Date().toISOString().slice(0, 10)
                        ? t('merchants.detail.registration.mapaqExpired', { date: formatDate(vendor.registration.mapaqExpiresOn) })
                        : formatDate(vendor.registration.mapaqExpiresOn)
                    }
                    icon={FileText}
                  />
                )}
                <Field label={t('merchants.detail.registration.officer')} value={vendor.registration.contactName} icon={FileText} />
                <Field label={t('merchants.detail.registration.phone')} value={vendor.registration.contactPhone} icon={Phone} />
                {/* The account as Stripe sees it today — not what was ticked at sign-up. */}
                <Field
                  label={t('merchants.detail.registration.payouts')}
                  value={
                    vendor.registration.payoutMethod && vendor.registration.payoutMethod !== 'stripe'
                      ? t('merchants.detail.registration.payoutsWithBankDocument', { account: payoutAccount })
                      : payoutAccount
                  }
                  icon={Landmark}
                />
                {vendor.registration.submittedAt && <Field label={t('merchants.detail.registration.submittedOn')} value={formatDate(vendor.registration.submittedAt)} icon={FileText} />}
              </dl>

              {vendor.registration.documents.length > 0 && (
                <div>
                  <Text variant="label" tone="muted" className="mb-2">
                    {t('merchants.detail.documents.title')}
                  </Text>
                  <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                    {vendor.registration.documents.map((doc) => (
                      <li key={doc.path} className="flex items-center justify-between gap-3 px-4 py-3">
                        <Text variant="body" className="font-medium">
                          {DOCUMENT_LABELS[doc.kind]}
                        </Text>
                        {doc.url ? (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                          >
                            {t('common.actions.open')} <ExternalLink size={14} />
                          </a>
                        ) : (
                          <Text variant="caption" tone="muted">
                            {t('merchants.detail.documents.linkUnavailable')}
                          </Text>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Text variant="caption" tone="muted" className="mt-2">
                    {t('merchants.detail.documents.linksExpire')}
                  </Text>
                </div>
              )}
            </div>
          ) : (
            <Text variant="body" tone="muted">
              {t('merchants.detail.registration.none')}
            </Text>
          )}
        </Card>

        <Card className="p-5">
          <Text variant="subtitle" className="mb-4">
            {t('merchants.detail.details.title')}
          </Text>
          <dl className="flex flex-col gap-4">
            <Field label={t('merchants.detail.details.address')} value={`${vendor.address.street}, ${vendor.city}`} icon={MapPin} />
            <Field label={t('merchants.detail.details.halal')} value={vendor.isHalalCertified ? t('common.actions.yes') : t('common.actions.no')} icon={FileText} />
            {vendor.status === 'approved' && <Field label={t('merchants.detail.details.rating')} value={t('merchants.detail.details.ratingValue', { rating: vendor.rating.toFixed(1), count: vendor.reviewCount })} icon={Star} />}
            <Field label={t('merchants.detail.details.deliveryTime')} value={t('common.time.minutes', { count: vendor.deliveryEtaMin })} icon={FileText} />
            {/* Recorded from Stripe, which bills it. Shown for information: it does not gate the shop. */}
            {vendor.subscription && (
              <Field label={t('merchants.detail.details.subscription')} value={subscriptionLabel(vendor.subscription)} icon={CreditCard} />
            )}
          </dl>
        </Card>
      </div>

      {statements && (
        <Card className="p-5">
          <Text variant="subtitle" className="mb-1">
            {t('merchants.detail.statements.title')}
          </Text>
          <Text variant="caption" tone="muted" className="mb-3">
            {t('merchants.detail.statements.description')}
          </Text>
          {statements.length === 0 ? (
            <Text variant="body" tone="muted">
              {t('merchants.detail.statements.none')}
            </Text>
          ) : (
            <ul className="flex flex-col">
              {statements.map((statement) => (
                <li key={statement.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0 last:pb-0">
                  <div>
                    <Text variant="body" className="font-medium capitalize">
                      {statementMonth(statement.period)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {statement.number} · {t('merchants.detail.statements.orders', { count: statement.totals.orderCount })} ·{' '}
                      {statement.emailedAt ? t('merchants.detail.statements.sentOn', { date: formatDate(statement.emailedAt) }) : t('merchants.detail.statements.notSent')}
                    </Text>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <Text variant="body" className="tabular font-semibold">
                        {formatCad(Math.abs(statement.totals.balanceCad))}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {statement.totals.balanceCad < 0 ? t('merchants.detail.statements.owedByShop') : t('merchants.detail.statements.owedToShop')}
                      </Text>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openStatement(statement)}>
                      {t('merchants.detail.statements.pdf')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={dialog === 'reject' ? t('merchants.detail.dialog.rejectTitle') : t('merchants.detail.dialog.suspendTitle')}
        description={
          dialog === 'reject'
            ? t('merchants.detail.dialog.rejectDescription')
            : t('merchants.detail.dialog.suspendDescription')
        }
        confirmLabel={dialog === 'reject' ? t('merchants.detail.actions.reject') : t('merchants.detail.actions.suspend')}
        tone="destructive"
        requireReason
        reasonLabel={t('common.confirm.reason')}
        busy={busy}
        onConfirm={handleDecision}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

const DOCUMENT_LABELS: Record<'id' | 'business_number' | 'mapaq' | 'bank', string> = lazy(() => ({
  id: t('merchants.detail.documents.id'),
  business_number: t('merchants.detail.documents.businessNumber'),
  mapaq: t('merchants.detail.documents.mapaq'),
  bank: t('merchants.detail.documents.bank'),
}));

function Field({ label, value, icon: Icon }: { label: string; value: string; icon: typeof FileText }) {
  useLocale();
  return (
    <div className="flex flex-wrap gap-2.5">
      <Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="body" className="font-medium">
          {value}
        </Text>
      </div>
    </div>
  );
}

/** Where a shop's monthly subscription stands, in one line. */
function subscriptionLabel(subscription: NonNullable<AdminVendorDetail['subscription']>): string {
  // « Actif — 29,00 $/mois »: the price follows the state, once the shop has one.
  const withPrice = (state: string) =>
    subscription.priceCad === null
      ? state
      : t('merchants.detail.subscription.withPrice', { state, price: formatCad(subscription.priceCad) });
  switch (subscription.status) {
    case 'active':
      if (subscription.cancelAt) return withPrice(t('merchants.detail.subscription.cancelling', { date: formatDate(subscription.cancelAt) }));
      return withPrice(
        subscription.currentPeriodEnd
          ? t('merchants.detail.subscription.renewing', { date: formatDate(subscription.currentPeriodEnd) })
          : t('merchants.detail.subscription.active')
      );
    case 'past_due':
      return withPrice(
        subscription.offlineAt
          ? t('merchants.detail.subscription.pastDueUntil', { date: formatDate(subscription.offlineAt) })
          : t('merchants.detail.subscription.pastDue')
      );
    case 'canceled':
      return t('merchants.detail.subscription.ended');
    default:
      return t('merchants.detail.subscription.none');
  }
}
