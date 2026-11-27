'use client';
import { useState } from 'react';
import { TicketPercent } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/insights/Insights';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { SelectField } from '@/components/merchant/fields';
import { createCoupon, deactivateCoupon, listMyCoupons, type Coupon, type CouponInput } from '@/lib/api/merchantBilling';
import { failureMessage, parseCount, parseMoney } from '@/lib/merchantForm';
import { usePagedList } from '@/lib/usePagedList';
import { formatCad, formatDate, formatPercent } from '@/lib/format';
import { t } from '@/lib/i18n';

type Errors = { code?: string; value?: string; usageLimit?: string; validDays?: string };

/**
 * The shop's promo codes, on the web: create one, see how often each was
 * used, end one early. Same rules as the mobile app's screen — the API checks
 * both.
 */
export default function MerchantCouponsPage() {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<CouponInput['discountType']>('percentage');
  const [value, setValue] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [validDays, setValidDays] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  // Remounts the form's inputs after a code is created, so their floating labels come back down.
  const [formKey, setFormKey] = useState(0);
  const [ending, setEnding] = useState<Coupon | null>(null);
  const [endingBusy, setEndingBusy] = useState(false);

  const list = usePagedList<Coupon>(({ offset, limit }) => listMyCoupons({ offset, limit }), 'all');

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(cleanCode)) next.code = t('portal.coupons.errors.code');

    let amount: number | null;
    if (discountType === 'percentage') {
      amount = parseCount(value);
      if (amount === null || amount < 1 || amount > 90) next.value = t('portal.coupons.errors.percentage');
    } else {
      amount = parseMoney(value);
      if (amount === null || amount <= 0 || amount > 500) next.value = t('portal.coupons.errors.amount');
    }

    const limit = usageLimit.trim() ? parseCount(usageLimit) : undefined;
    if (limit === null || (limit !== undefined && (limit < 1 || limit > 100_000))) next.usageLimit = t('portal.coupons.errors.usageLimit');
    const days = validDays.trim() ? parseCount(validDays) : undefined;
    if (days === null || (days !== undefined && (days < 1 || days > 365))) next.validDays = t('portal.coupons.errors.validDays');

    setErrors(next);
    if (Object.keys(next).length > 0 || amount === null) return;

    setSaving(true);
    try {
      await createCoupon({
        code: cleanCode,
        discountType,
        discountValue: amount,
        ...(limit != null ? { usageLimit: limit } : {}),
        ...(days != null ? { validDays: days } : {}),
      });
      toast('success', t('portal.coupons.created', { code: cleanCode }));
      setCode('');
      setValue('');
      setUsageLimit('');
      setValidDays('');
      setFormKey((key) => key + 1);
      list.setPage(1);
      list.reload();
    } catch (error) {
      toast('error', failureMessage(error, t('portal.coupons.createFailed')));
    } finally {
      setSaving(false);
    }
  }

  async function end() {
    if (!ending) return;
    setEndingBusy(true);
    try {
      await deactivateCoupon(ending.id);
      toast('success', t('portal.coupons.ended', { code: ending.code }));
      list.reload();
    } catch (error) {
      toast('error', failureMessage(error, t('portal.coupons.endFailed')));
    } finally {
      setEndingBusy(false);
      setEnding(null);
    }
  }

  const columns: Column<Coupon>[] = [
    {
      key: 'code',
      header: t('portal.coupons.columns.code'),
      render: (c) => (
        <Text variant="body" className="font-semibold tracking-wide">
          {c.code}
        </Text>
      ),
    },
    {
      key: 'discount',
      header: t('portal.coupons.columns.discount'),
      render: (c) => <Text variant="body" className="tabular">{c.discountType === 'percentage' ? formatPercent(c.discountValue / 100) : formatCad(c.discountValue)}</Text>,
    },
    {
      key: 'used',
      header: t('portal.coupons.columns.uses'),
      render: (c) => (
        <Text variant="body" className="tabular">
          {c.usedCount}
          {c.usageLimit !== null ? ` / ${c.usageLimit}` : ''}
        </Text>
      ),
    },
    {
      key: 'endsAt',
      header: t('portal.coupons.columns.end'),
      render: (c) => (
        <Text variant="body" tone="muted">
          {c.endsAt ? formatDate(c.endsAt) : t('portal.coupons.noEndDate')}
        </Text>
      ),
    },
    {
      key: 'status',
      header: t('portal.coupons.columns.state'),
      render: (c) => <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? t('portal.coupons.stateActive') : t('portal.coupons.stateEnded')}</Badge>,
    },
    {
      key: 'action',
      header: '',
      className: 'text-right',
      render: (c) =>
        c.active ? (
          <Button variant="outline" size="sm" onClick={() => setEnding(c)}>
            {t('portal.coupons.end')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={TicketPercent}
        title={t('nav.merchant.coupons')}
        description={t('portal.coupons.description')}
      />

      <Card as="section" className="p-5 sm:p-6">
        <form key={formKey} onSubmit={create} noValidate className="flex flex-col gap-5">
          <Text variant="subtitle">{t('portal.coupons.form.title')}</Text>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label={t('portal.coupons.form.code')}
              required
              maxLength={20}
              value={code}
              error={errors.code}
              helper={t('portal.coupons.form.codeHelper')}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <SelectField
              label={t('portal.coupons.form.type')}
              value={discountType}
              options={[
                { value: 'percentage', label: t('portal.coupons.form.typePercentage') },
                { value: 'fixed', label: t('portal.coupons.form.typeFixed') },
              ]}
              onChange={(next) => {
                setDiscountType(next as CouponInput['discountType']);
                setErrors((current) => ({ ...current, value: undefined }));
              }}
            />
            <Input
              label={discountType === 'percentage' ? t('portal.coupons.form.percentage') : t('portal.coupons.form.amount')}
              required
              inputMode={discountType === 'percentage' ? 'numeric' : 'decimal'}
              value={value}
              error={errors.value}
              helper={discountType === 'percentage' ? t('portal.coupons.form.percentageHelper') : t('portal.coupons.form.amountHelper')}
              onChange={(e) => setValue(e.target.value)}
            />
            <Input
              label={t('portal.coupons.form.usageLimit')}
              inputMode="numeric"
              value={usageLimit}
              error={errors.usageLimit}
              helper={t('portal.coupons.form.usageLimitHelper')}
              onChange={(e) => setUsageLimit(e.target.value)}
            />
            <Input
              label={t('portal.coupons.form.validDays')}
              inputMode="numeric"
              value={validDays}
              error={errors.validDays}
              helper={t('portal.coupons.form.validDaysHelper')}
              onChange={(e) => setValidDays(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? t('portal.coupons.form.creating') : t('portal.coupons.form.create')}
            </Button>
          </div>
        </form>
      </Card>

      {list.error && (
        <Text variant="body" tone="destructive">
          {t('portal.coupons.loadFailed')}
        </Text>
      )}

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(c) => c.id}
          loading={list.rows === null && !list.error}
          emptyIcon={TicketPercent}
          emptyTitle={t('portal.coupons.emptyTitle')}
          emptyDescription={t('portal.coupons.emptyDescription')}
          server={{
            page: list.page,
            pageSize: list.pageSize,
            total: list.total,
            onPage: list.setPage,
            onPageSize: list.setPageSize,
            sort: list.sort,
            onSort: list.setSort,
          }}
        />
      </Card>

      <ConfirmDialog
        open={ending !== null}
        title={t('portal.coupons.confirmEnd.title', { code: ending?.code ?? '' })}
        description={t('portal.coupons.confirmEnd.description')}
        confirmLabel={t('portal.coupons.confirmEnd.confirmLabel')}
        tone="destructive"
        busy={endingBusy}
        onConfirm={end}
        onCancel={() => setEnding(null)}
      />
    </div>
  );
}
