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
import type { PlatformSettings } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';
import { PageHeader } from '@/components/insights/Insights';

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
  const toast = useToast();
  const { can } = useAdmin();
  const [loaded, setLoaded] = useState(false);
  const [fields, setFields] = useState<FieldState | null>(null);
  const [doublePointsActive, setDoublePointsActive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
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
      setFields(toFields(saved));
      setDoublePointsActive(saved.doublePointsActive);
      toast('success', 'Paramètres enregistrés.');
    } catch (error) {
      // A refused value — a cancellation delay shorter than the alert delay,
      // say — used to leave the button spinning for good.
      toast('error', error instanceof Error ? error.message : 'Les paramètres n’ont pas pu être enregistrés.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <PageHeader
        icon={Settings}
        title="Paramètres de la plateforme"
        description="Monétisation et règles du programme de fidélité, appliquées à toute la plateforme."
        actions={
          can('settings.manage') ? (
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          ) : (
            <Text variant="caption" tone="muted">
              Lecture seule — votre rôle ne permet pas de modifier les paramètres.
            </Text>
          )
        }
      />

      <Card className="p-6">
        <Text variant="subtitle" className="mb-1">
          Monétisation
        </Text>
        <Text variant="caption" tone="muted" className="mb-4">
          Appliquées simultanément à chaque commerçant — commission par vente et abonnement mensuel.
        </Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Taux de commission (%)"
            type="number"
            step="0.1"
            min={0}
            max={100}
            {...field('commissionPct')}
            helper="Calculé sur le sous-total des ventes, hors taxes et livraison."
          />
          <Input label="Abonnement mensuel (CAD)" type="number" step="1" min={0} {...field('monthlySubscriptionCad')} />
        </div>
      </Card>

      <Card className="p-6">
        <Text variant="subtitle" className="mb-1">
          Points Sougouba (fidélité)
        </Text>
        <Text variant="caption" tone="muted" className="mb-4">
          Règles du programme de points, coupons et parrainage.
        </Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Points gagnés par $ dépensé" type="number" step="0.1" min={0} {...field('pointsPerCad')} />
          <Input label="Points requis pour 1 $ de rabais" type="number" step="1" min={1} {...field('pointsPerCadRedeemed')} />
          <Input label="Plafond de rachat (% du sous-total)" type="number" step="1" min={0} max={100} {...field('redemptionPct')} />
          <Input label="Expiration des points (mois)" type="number" step="1" min={1} {...field('pointsExpiryMonths')} />
          <Input label="Points de parrainage (chaque partie)" type="number" step="1" min={0} {...field('referralRewardPoints')} />
          <Input label="1re commande min. pour parrainage (CAD)" type="number" step="1" min={0} {...field('referralMinFirstOrderCad')} />
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
              Journées points doublés
            </Text>
            <Text variant="caption" tone="muted">
              Double temporairement les points gagnés sur chaque commande livrée.
            </Text>
          </div>
        </label>
      </Card>

      {fields.shopConfirmRemindMin !== '' && (
        <Card className="p-6">
          <Text variant="subtitle" className="mb-1">
            Commande sans réponse du commerce
          </Text>
          <Text variant="caption" tone="muted" className="mb-4">
            Le client paie en commandant. Si le commerce n’accepte pas la commande, il reçoit un rappel, puis elle est annulée
            et le client remboursé en totalité. Le délai compte à partir de la commande.
          </Text>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Rappeler le commerce après (minutes)"
              type="number"
              step="1"
              min={0}
              max={120}
              helper="Une notification sur son téléphone, une seule fois. 0 = pas de rappel."
              {...field('shopConfirmRemindMin')}
            />
            <Input
              label="Annuler et rembourser après (minutes)"
              type="number"
              step="1"
              min={0}
              max={1440}
              helper="Doit être plus long que le délai de rappel. 0 = jamais automatiquement."
              {...field('shopConfirmCancelMin')}
            />
          </div>
        </Card>
      )}

      {fields.courierLateRemindMin !== '' && (
        <Card className="p-6">
          <Text variant="subtitle" className="mb-1">
            Livreur qui ne vient pas chercher la commande
          </Text>
          <Text variant="caption" tone="muted" className="mb-4">
            Un livreur qui accepte une course la bloque pour les autres. Le retard se compte à partir de l’heure d’arrivée
            estimée quand il a accepté (selon sa distance et son véhicule). La course retirée repart vers un autre livreur ; une
            course sur laquelle le livreur a signalé un incident n’est jamais retirée automatiquement.
          </Text>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Rappeler le livreur après (minutes de retard)"
              type="number"
              step="1"
              min={0}
              max={240}
              helper="Une notification, une seule fois. 0 = pas de rappel."
              {...field('courierLateRemindMin')}
            />
            <Input
              label="Retirer la course après (minutes de retard)"
              type="number"
              step="1"
              min={0}
              max={1440}
              helper="Doit être plus long que le délai de rappel. 0 = jamais automatiquement."
              {...field('courierLateReleaseMin')}
            />
          </div>
        </Card>
      )}

      {fields.noCourierAlertMin !== '' && (
        <Card className="p-6">
          <Text variant="subtitle" className="mb-1">
            Commande prête, sans livreur
          </Text>
          <Text variant="caption" tone="muted" className="mb-4">
            Ce qui arrive quand une commande est prête et qu’aucun livreur ne la prend. Le délai compte à partir du moment où
            elle est prête — ou du moment où un livreur l’a rendue.
          </Text>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Prévenir l’équipe après (minutes)"
              type="number"
              step="1"
              min={1}
              max={1440}
              helper="Un courriel à l’équipe, et la commande s’affiche en haut de la page Commandes."
              {...field('noCourierAlertMin')}
            />
            <Input
              label="Annuler et rembourser après (minutes)"
              type="number"
              step="1"
              min={0}
              max={1440}
              helper="Doit être plus long que le délai d’alerte. 0 = jamais automatiquement : l’équipe décide."
              {...field('noCourierCancelMin')}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
