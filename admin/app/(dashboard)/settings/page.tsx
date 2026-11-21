'use client';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/data/Skeleton';
import { useToast } from '@/components/Toast';
import { getSettings, updateSettings } from '@/lib/api/settings';
import type { PlatformSettings } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';

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
    const saved = await updateSettings(toPatch(fields, doublePointsActive));
    setFields(toFields(saved));
    setDoublePointsActive(saved.doublePointsActive);
    setSaving(false);
    toast('success', 'Paramètres enregistrés.');
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Text as="h1" variant="display">
            Paramètres de la plateforme
          </Text>
          <Text variant="body" tone="muted" className="mt-1">
            Monétisation et règles du programme de fidélité.
          </Text>
        </div>
        {can('settings.manage') ? (
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        ) : (
          <Text variant="caption" tone="muted">
            Lecture seule — votre rôle ne permet pas de modifier les paramètres.
          </Text>
        )}
      </div>

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
    </div>
  );
}
