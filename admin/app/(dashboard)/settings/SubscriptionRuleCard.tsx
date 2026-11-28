'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { getSubscriptionImpact, updateSettings, type SubscriptionImpact } from '@/lib/api/settings';
import { t, useLocale } from '@/lib/i18n';
import type { PlatformSettings } from '@/lib/types';

/**
 * Whether a shop must have its monthly subscription in order to sell, and how
 * long it keeps selling after a renewal fails.
 *
 * Saved on its own, not with the rest of the form. Requiring the subscription
 * takes every unsubscribed shop offline the moment it is saved, so it is asked
 * for by name, behind a confirmation that says how many shops that is — never
 * carried along by a save of the commission rate from a page left open since
 * before someone else changed it.
 */
export function SubscriptionRuleCard({
  settings,
  canManage,
  onSaved,
}: {
  settings: PlatformSettings;
  canManage: boolean;
  onSaved: (settings: PlatformSettings) => void;
}) {
  useLocale();
  const toast = useToast();
  const required = settings.subscriptionRequired === true;
  const [graceDays, setGraceDays] = useState(String(settings.subscriptionGraceDays ?? 7));
  const [impact, setImpact] = useState<SubscriptionImpact | null>(null);
  const [dialog, setDialog] = useState<'require' | 'stop' | null>(null);
  const [busy, setBusy] = useState(false);

  // Read again after every save: the count is of shops as they stand now.
  useEffect(() => {
    getSubscriptionImpact()
      .then(setImpact)
      .catch(() => setImpact(null));
  }, [settings]);

  async function save(patch: Partial<PlatformSettings>, done: string) {
    setBusy(true);
    try {
      onSaved(await updateSettings(patch));
      toast('success', done);
      setDialog(null);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('settings.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const days = Math.round(Number(graceDays) || 0);
  const offline = impact?.notInOrder ?? 0;

  return (
    <Card className="p-6">
      <Text variant="subtitle" className="mb-1">
        {t('settings.subscriptionRule.title')}
      </Text>
      <Text variant="caption" tone="muted" className="mb-4">
        {t('settings.subscriptionRule.intro')}
      </Text>

      <Text variant="body" className="font-medium">
        {required ? t('settings.subscriptionRule.stateOn') : t('settings.subscriptionRule.stateOff')}
      </Text>
      {impact && (
        <Text variant="body" tone="muted" className="mt-1">
          {!impact.enforceable
            ? t('settings.subscriptionRule.notEnforceable')
            : offline === 0
              ? t('settings.subscriptionRule.impactNone', { shops: impact.shops })
              : t('settings.subscriptionRule.impact', { count: offline, notInOrder: offline, shops: impact.shops })}
        </Text>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={t('settings.subscriptionRule.graceDays')}
          type="number"
          step="1"
          min={0}
          max={60}
          value={graceDays}
          onChange={(e) => setGraceDays(e.target.value)}
          helper={t('settings.subscriptionRule.graceHelper')}
          disabled={!canManage}
        />
      </div>

      {canManage && (
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button
            variant="outline"
            onClick={() => save({ subscriptionGraceDays: days }, t('settings.subscriptionRule.graceSaved'))}
            disabled={busy || days === (settings.subscriptionGraceDays ?? 7)}
          >
            {t('settings.subscriptionRule.saveGrace')}
          </Button>
          {required ? (
            <Button variant="outline" onClick={() => setDialog('stop')} disabled={busy}>
              {t('settings.subscriptionRule.stopRequiring')}
            </Button>
          ) : (
            // Not offered while it could do nothing but harm: with no fee set or no
            // Stripe, there is nothing a shop could pay to come back.
            <Button variant="primary" onClick={() => setDialog('require')} disabled={busy || !impact?.enforceable}>
              {t('settings.subscriptionRule.require')}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'require'}
        title={t('settings.subscriptionRule.requireTitle')}
        description={
          offline === 0
            ? t('settings.subscriptionRule.requireBodyNone')
            : t('settings.subscriptionRule.requireBody', { count: offline })
        }
        confirmLabel={t('settings.subscriptionRule.require')}
        tone={offline === 0 ? 'primary' : 'destructive'}
        busy={busy}
        onConfirm={() =>
          save({ subscriptionRequired: true, subscriptionGraceDays: days }, t('settings.subscriptionRule.nowRequired'))
        }
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'stop'}
        title={t('settings.subscriptionRule.stopTitle')}
        description={t('settings.subscriptionRule.stopBody')}
        confirmLabel={t('settings.subscriptionRule.stopRequiring')}
        busy={busy}
        onConfirm={() => save({ subscriptionRequired: false }, t('settings.subscriptionRule.noLongerRequired'))}
        onCancel={() => setDialog(null)}
      />
    </Card>
  );
}
