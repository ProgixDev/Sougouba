'use client';
import { useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/data/Skeleton';
import { useToast } from '@/components/Toast';
import { getSettings, updateSettings } from '@/lib/api/settings';
import { t, useLocale } from '@/lib/i18n';
import type { PlatformSettings } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';
import { PageHeader } from '@/components/insights/Insights';
import { SubscriptionRuleCard } from './SubscriptionRuleCard';

/**
 * Every numeric field is edited as a free-typed local string, not a value
 * re-derived from `settings` on each keystroke — a controlled number input
 * whose `value` is recomputed from stored state (e.g. `(rate * 100).toFixed(1)`)
 * fights the user mid-edit: typing "1" already re-renders the field to "1.0",
 * so the next keystroke lands at the wrong position and corrupts the number.
 * Parsing back to `PlatformSettings` only happens on Save.
 */
interface FieldState {
  commissionPct: string;
  monthlySubscriptionCad: string;
  pointsPerCad: string;
  pointsPerCadRedeemed: string;
  redemptionPct: string;
  pointsExpiryMonths: string;
  referralRewardPoints: string;
  referralMinFirstOrderCad: string;
  /** Empty when the API does not have the two delays yet: the card is hidden and they are not sent. */
  noCourierAlertMin: string;
  noCourierCancelMin: string;
  shopConfirmRemindMin: string;
  shopConfirmCancelMin: string;
  courierLateRemindMin: string;
  courierLateReleaseMin: string;
}

function toFields(s: PlatformSettings): FieldState {
  return {
    commissionPct: String(s.commissionRate * 100),
    monthlySubscriptionCad: String(s.monthlySubscriptionCad),
    pointsPerCad: String(s.pointsPerCad),
    pointsPerCadRedeemed: String(s.pointsPerCadRedeemed),
    redemptionPct: String(s.maxRedemptionShare * 100),
    pointsExpiryMonths: String(s.pointsExpiryMonths),
    referralRewardPoints: String(s.referralRewardPoints),
    referralMinFirstOrderCad: String(s.referralMinFirstOrderCad),
    noCourierAlertMin: s.noCourierAlertMin === undefined ? '' : String(s.noCourierAlertMin),
    noCourierCancelMin: s.noCourierCancelMin === undefined ? '' : String(s.noCourierCancelMin),
    shopConfirmRemindMin: s.shopConfirmRemindMin === undefined ? '' : String(s.shopConfirmRemindMin),
    shopConfirmCancelMin: s.shopConfirmCancelMin === undefined ? '' : String(s.shopConfirmCancelMin),
    courierLateRemindMin: s.courierLateRemindMin === undefined ? '' : String(s.courierLateRemindMin),
    courierLateReleaseMin: s.courierLateReleaseMin === undefined ? '' : String(s.courierLateReleaseMin),
  };
}

function toPatch(f: FieldState, doublePointsActive: boolean): PlatformSettings {
  const num = (v: string) => Number(v) || 0;
  return {
    commissionRate: num(f.commissionPct) / 100,
    monthlySubscriptionCad: num(f.monthlySubscriptionCad),
    pointsPerCad: num(f.pointsPerCad),
    pointsPerCadRedeemed: num(f.pointsPerCadRedeemed),
    maxRedemptionShare: num(f.redemptionPct) / 100,
    pointsExpiryMonths: num(f.pointsExpiryMonths),
    referralRewardPoints: num(f.referralRewardPoints),
    referralMinFirstOrderCad: num(f.referralMinFirstOrderCad),
    doublePointsActive,
    ...(f.noCourierAlertMin !== '' && f.noCourierCancelMin !== ''
      ? { noCourierAlertMin: Math.round(num(f.noCourierAlertMin)), noCourierCancelMin: Math.round(num(f.noCourierCancelMin)) }
      : {}),
    ...(f.shopConfirmRemindMin !== '' && f.shopConfirmCancelMin !== ''
      ? { shopConfirmRemindMin: Math.round(num(f.shopConfirmRemindMin)), shopConfirmCancelMin: Math.round(num(f.shopConfirmCancelMin)) }
      : {}),
    ...(f.courierLateRemindMin !== '' && f.courierLateReleaseMin !== ''
      ? { courierLateRemindMin: Math.round(num(f.courierLateRemindMin)), courierLateReleaseMin: Math.round(num(f.courierLateReleaseMin)) }
      : {}),
  };
}

export default function SettingsPage() {
  useLocale();
  const toast = useToast();
  const { can } = useAdmin();
  const [loaded, setLoaded] = useState(false);
  const [fields, setFields] = useState<FieldState | null>(null);
  /** The settings as last read or saved — what the subscription rule's own card shows and saves from. */
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [doublePointsActive, setDoublePointsActive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setFields(toFields(s));
      setDoublePointsActive(s.doublePointsActive);
      setLoaded(true);
    });
  }, []);

  if (!loaded || !fields) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  function field(key: keyof FieldState) {
    return {
      value: fields![key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => (f ? { ...f, [key]: e.target.value } : f)),
    };
  }

  async function handleSave() {
    if (!fields) return;
    setSaving(true);
    try {
      const saved = await updateSettings(toPatch(fields, doublePointsActive));
      setSettings(saved);
      setFields(toFields(saved));
      setDoublePointsActive(saved.doublePointsActive);
      toast('success', t('settings.saved'));
    } catch (error) {
      // A refused value — a cancellation delay shorter than the alert delay,
      // say — used to leave the button spinning for good.
      toast('error', error instanceof Error ? error.message : t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Settings}
        title={t('settings.title')}
        description={t('settings.description')}
        actions={
          can('settings.manage') ? (
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? t('settings.saving') : t('common.actions.save')}
            </Button>
          ) : (
            <Text variant="caption" tone="muted">
              {t('settings.readOnly')}
            </Text>
          )
        }
      />

      <Card className="p-6">
        <Text variant="subtitle" className="mb-1">
          {t('settings.monetization.title')}
        </Text>
        <Text variant="caption" tone="muted" className="mb-4">
          {t('settings.monetization.intro')}
        </Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t('settings.monetization.commissionRate')}
            type="number"
            step="0.1"
            min={0}
            max={100}
            {...field('commissionPct')}
            helper={t('settings.monetization.commissionHelper')}
          />
          <Input label={t('settings.monetization.monthlySubscription')} type="number" step="1" min={0} {...field('monthlySubscriptionCad')} />
        </div>
      </Card>

      {/* Hidden against an API that does not know the rule yet, like the delay cards below. */}
      {settings && settings.subscriptionRequired !== undefined && (
        <SubscriptionRuleCard settings={settings} canManage={can('settings.manage')} onSaved={setSettings} />
      )}

      <Card className="p-6">
        <Text variant="subtitle" className="mb-1">
          {t('settings.loyalty.title')}
        </Text>
        <Text variant="caption" tone="muted" className="mb-4">
          {t('settings.loyalty.intro')}
        </Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label={t('settings.loyalty.pointsPerCad')} type="number" step="0.1" min={0} {...field('pointsPerCad')} />
          <Input label={t('settings.loyalty.pointsPerCadRedeemed')} type="number" step="1" min={1} {...field('pointsPerCadRedeemed')} />
          <Input label={t('settings.loyalty.redemptionCap')} type="number" step="1" min={0} max={100} {...field('redemptionPct')} />
          <Input label={t('settings.loyalty.pointsExpiry')} type="number" step="1" min={1} {...field('pointsExpiryMonths')} />
          <Input label={t('settings.loyalty.referralPoints')} type="number" step="1" min={0} {...field('referralRewardPoints')} />
          <Input label={t('settings.loyalty.referralMinFirstOrder')} type="number" step="1" min={0} {...field('referralMinFirstOrderCad')} />
        </div>
        <label className="mt-5 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={doublePointsActive}
            onChange={(e) => setDoublePointsActive(e.target.checked)}
            className="h-5 w-5 cursor-pointer accent-forest-600"
          />
          <div>
            <Text variant="body" className="font-medium">
              {t('settings.loyalty.doublePointsTitle')}
            </Text>
            <Text variant="caption" tone="muted">
              {t('settings.loyalty.doublePointsBody')}
            </Text>
          </div>
        </label>
      </Card>

      {fields.shopConfirmRemindMin !== '' && (
        <Card className="p-6">
          <Text variant="subtitle" className="mb-1">
            {t('settings.shopConfirm.title')}
          </Text>
          <Text variant="caption" tone="muted" className="mb-4">
            {t('settings.shopConfirm.intro')}
          </Text>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={t('settings.shopConfirm.remindAfter')}
              type="number"
              step="1"
              min={0}
              max={120}
              helper={t('settings.shopConfirm.remindHelper')}
              {...field('shopConfirmRemindMin')}
            />
            <Input
              label={t('settings.shopConfirm.cancelAfter')}
              type="number"
              step="1"
              min={0}
              max={1440}
              helper={t('settings.shopConfirm.cancelHelper')}
              {...field('shopConfirmCancelMin')}
            />
          </div>
        </Card>
      )}

      {fields.courierLateRemindMin !== '' && (
        <Card className="p-6">
          <Text variant="subtitle" className="mb-1">
            {t('settings.courierLate.title')}
          </Text>
          <Text variant="caption" tone="muted" className="mb-4">
            {t('settings.courierLate.intro')}
          </Text>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={t('settings.courierLate.remindAfter')}
              type="number"
              step="1"
              min={0}
              max={240}
              helper={t('settings.courierLate.remindHelper')}
              {...field('courierLateRemindMin')}
            />
            <Input
              label={t('settings.courierLate.releaseAfter')}
              type="number"
              step="1"
              min={0}
              max={1440}
              helper={t('settings.courierLate.releaseHelper')}
              {...field('courierLateReleaseMin')}
            />
          </div>
        </Card>
      )}

      {fields.noCourierAlertMin !== '' && (
        <Card className="p-6">
          <Text variant="subtitle" className="mb-1">
            {t('settings.noCourier.title')}
          </Text>
          <Text variant="caption" tone="muted" className="mb-4">
            {t('settings.noCourier.intro')}
          </Text>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={t('settings.noCourier.alertAfter')}
              type="number"
              step="1"
              min={1}
              max={1440}
              helper={t('settings.noCourier.alertHelper')}
              {...field('noCourierAlertMin')}
            />
            <Input
              label={t('settings.noCourier.cancelAfter')}
              type="number"
              step="1"
              min={0}
              max={1440}
              helper={t('settings.noCourier.cancelHelper')}
              {...field('noCourierCancelMin')}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
