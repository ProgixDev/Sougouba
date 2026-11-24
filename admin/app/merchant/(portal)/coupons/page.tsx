'use client';
import { useState } from 'react';
import { TicketPercent } from 'lucide-react';
import { Card } from '@/components/ui/Card';
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
import { formatCad, formatDate } from '@/lib/format';

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
    if (!/^[A-Z0-9]{3,20}$/.test(cleanCode)) next.code = 'De 3 à 20 lettres ou chiffres, sans espace';

    let amount: number | null;
    if (discountType === 'percentage') {
      amount = parseCount(value);
      if (amount === null || amount < 1 || amount > 90) next.value = 'Un nombre entier de 1 à 90';
    } else {
      amount = parseMoney(value);
      if (amount === null || amount <= 0 || amount > 500) next.value = 'Un montant de 0,01 $ à 500 $';
    }

    const limit = usageLimit.trim() ? parseCount(usageLimit) : undefined;
    if (limit === null || (limit !== undefined && (limit < 1 || limit > 100_000))) next.usageLimit = 'Au moins 1 utilisation';
    const days = validDays.trim() ? parseCount(validDays) : undefined;
    if (days === null || (days !== undefined && (days < 1 || days > 365))) next.validDays = 'De 1 à 365 jours';

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
      toast('success', `Code ${cleanCode} créé`);
      setCode('');
      setValue('');
      setUsageLimit('');
      setValidDays('');
      setFormKey((key) => key + 1);
      list.setPage(1);
      list.reload();
    } catch (error) {
      toast('error', failureMessage(error, 'Création impossible. Veuillez réessayer.'));
    } finally {
      setSaving(false);
    }
  }

  async function end() {
    if (!ending) return;
    setEndingBusy(true);
    try {
      await deactivateCoupon(ending.id);
      toast('success', `Code ${ending.code} terminé`);
      list.reload();
    } catch (error) {
      toast('error', failureMessage(error, 'Modification impossible. Veuillez réessayer.'));
    } finally {
      setEndingBusy(false);
      setEnding(null);
    }
  }

  const columns: Column<Coupon>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => (
        <Text variant="body" className="font-semibold tracking-wide">
          {c.code}
        </Text>
      ),
    },
    {
      key: 'discount',
      header: 'Réduction',
      render: (c) => <Text variant="body" className="tabular">{c.discountType === 'percentage' ? `${c.discountValue} %` : formatCad(c.discountValue)}</Text>,
    },
    {
      key: 'used',
      header: 'Utilisations',
      render: (c) => (
        <Text variant="body" className="tabular">
          {c.usedCount}
          {c.usageLimit !== null ? ` / ${c.usageLimit}` : ''}
        </Text>
      ),
    },
    {
      key: 'endsAt',
      header: 'Fin',
      render: (c) => (
        <Text variant="body" tone="muted">
          {c.endsAt ? formatDate(c.endsAt) : 'Sans date de fin'}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'État',
      render: (c) => <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Actif' : 'Terminé'}</Badge>,
    },
    {
      key: 'action',
      header: '',
      className: 'text-right',
      render: (c) =>
        c.active ? (
          <Button variant="outline" size="sm" onClick={() => setEnding(c)}>
            Terminer
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text as="h1" variant="display">
          Codes promo
        </Text>
        <Text variant="body" tone="muted" className="mt-1">
          Une réduction sur les produits de votre boutique, que vos clients saisissent au moment de payer.
        </Text>
      </div>

      <Card as="section" className="p-5 sm:p-6">
        <form key={formKey} onSubmit={create} noValidate className="flex flex-col gap-5">
          <Text variant="subtitle">Nouveau code</Text>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Code"
              required
              maxLength={20}
              value={code}
              error={errors.code}
              helper="Ce que le client tape : BIENVENUE10"
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <SelectField
              label="Type de réduction"
              value={discountType}
              options={[
                { value: 'percentage', label: 'Pourcentage (%)' },
                { value: 'fixed', label: 'Montant fixe ($)' },
              ]}
              onChange={(next) => {
                setDiscountType(next as CouponInput['discountType']);
                setErrors((current) => ({ ...current, value: undefined }));
              }}
            />
            <Input
              label={discountType === 'percentage' ? 'Pourcentage' : 'Montant ($)'}
              required
              inputMode={discountType === 'percentage' ? 'numeric' : 'decimal'}
              value={value}
              error={errors.value}
              helper={discountType === 'percentage' ? 'De 1 à 90' : 'De 0,01 $ à 500 $'}
              onChange={(e) => setValue(e.target.value)}
            />
            <Input
              label="Nombre d’utilisations"
              inputMode="numeric"
              value={usageLimit}
              error={errors.usageLimit}
              helper="Facultatif. Vide : illimité."
              onChange={(e) => setUsageLimit(e.target.value)}
            />
            <Input
              label="Durée de validité (jours)"
              inputMode="numeric"
              value={validDays}
              error={errors.validDays}
              helper="Facultatif. Vide : sans date de fin."
              onChange={(e) => setValidDays(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Création…' : 'Créer le code'}
            </Button>
          </div>
        </form>
      </Card>

      {list.error && (
        <Text variant="body" tone="destructive">
          Impossible de charger vos codes promo. Vérifiez votre connexion et rechargez la page.
        </Text>
      )}

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(c) => c.id}
          loading={list.rows === null && !list.error}
          emptyIcon={TicketPercent}
          emptyTitle="Aucun code promo"
          emptyDescription="Créez votre premier code ci-dessus."
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
        title={`Terminer le code ${ending?.code ?? ''} ?`}
        description="Il ne pourra plus être utilisé à partir de maintenant. Les commandes déjà passées gardent leur réduction."
        confirmLabel="Terminer le code"
        tone="destructive"
        busy={endingBusy}
        onConfirm={end}
        onCancel={() => setEnding(null)}
      />
    </div>
  );
}
