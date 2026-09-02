'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Ban, Phone, Car, ShieldCheck, MapPin } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { getCourier, getCourierNote, approveCourier, rejectCourier } from '@/lib/api/couriers';
import { courierStatusMeta, VEHICLE_LABELS } from '@/lib/statusMeta';
import { formatDate } from '@/lib/format';
import type { Courier } from '@/lib/types';

export default function CourierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [courier, setCourier] = useState<Courier | null | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>();
  const [dialog, setDialog] = useState<'reject' | 'suspend' | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [c, n] = await Promise.all([getCourier(id), getCourierNote(id)]);
    setCourier(c ?? null);
    setNote(n);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (courier === undefined) {
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  }
  if (courier === null) {
    return (
      <div className="mx-auto max-w-content">
        <Text variant="title">Livreur introuvable</Text>
      </div>
    );
  }

  const meta = courierStatusMeta(courier.status);

  async function handleApprove() {
    setBusy(true);
    await approveCourier(courier!.id);
    setBusy(false);
    toast('success', `${courier!.fullName} a été approuvé.`);
    load();
  }

  async function handleReject(reason?: string) {
    setBusy(true);
    await rejectCourier(courier!.id, reason ?? '');
    setBusy(false);
    setDialog(null);
    toast('info', `${courier!.fullName} a été ${courier!.status === 'pending' ? 'refusé' : 'suspendu'}.`);
    load();
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Livreurs', href: '/couriers' }, { label: courier.fullName }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Text as="h1" variant="display">
              {courier.fullName}
            </Text>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {VEHICLE_LABELS[courier.vehicle]} · {courier.city}
          </Text>
        </div>
        <div className="flex gap-2.5">
          {courier.status !== 'approved' && (
            <Button variant="primary" onClick={handleApprove} disabled={busy}>
              <CheckCircle2 size={16} /> Approuver
            </Button>
          )}
          {courier.status === 'pending' && (
            <Button variant="destructive" onClick={() => setDialog('reject')} disabled={busy}>
              <XCircle size={16} /> Refuser
            </Button>
          )}
          {courier.status === 'approved' && (
            <Button variant="destructive" onClick={() => setDialog('suspend')} disabled={busy}>
              <Ban size={16} /> Suspendre
            </Button>
          )}
        </div>
      </div>

      {note && (
        <Card elevated={false} className="border-destructive/30 bg-destructive/5 p-4">
          <Text variant="label" tone="destructive">
            Motif du refus / de la suspension
          </Text>
          <Text variant="body" className="mt-1">
            {note}
          </Text>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Text variant="subtitle" className="mb-4">
            Dossier du livreur
          </Text>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Téléphone" value={courier.phone} icon={Phone} />
            <Field label="Véhicule" value={`${VEHICLE_LABELS[courier.vehicle]}${courier.plate ? ` · ${courier.plate}` : ''}`} icon={Car} />
            {courier.licenceNumber && <Field label="Numéro de permis" value={courier.licenceNumber} icon={ShieldCheck} />}
            {courier.insurance && (
              <>
                <Field label="Assureur" value={courier.insurance.insurerName} icon={ShieldCheck} />
                <Field label="Police d'assurance" value={courier.insurance.policyNumber} icon={ShieldCheck} />
                <Field label="Expiration" value={courier.insurance.expiry} icon={ShieldCheck} />
              </>
            )}
            <Field label="Inscrit le" value={formatDate(courier.joinedAt)} icon={ShieldCheck} />
          </dl>
        </Card>

        <Card className="p-5">
          <Text variant="subtitle" className="mb-4">
            Détails
          </Text>
          <dl className="flex flex-col gap-4">
            <Field label="Secteur" value={courier.city} icon={MapPin} />
            {courier.status === 'approved' && (
              <>
                <Field label="Note" value={courier.rating.toFixed(1)} icon={ShieldCheck} />
                <Field label="Livraisons effectuées" value={String(courier.deliveryCount)} icon={ShieldCheck} />
              </>
            )}
          </dl>
        </Card>
      </div>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog === 'reject' ? 'Refuser ce livreur ?' : 'Suspendre ce livreur ?'}
        description={
          dialog === 'reject'
            ? 'Le livreur ne pourra pas accepter de courses. Précisez le motif — il aide le livreur à corriger son dossier.'
            : 'Le livreur sera retiré immédiatement de la plateforme. Précisez le motif de la suspension.'
        }
        confirmLabel={dialog === 'reject' ? 'Refuser' : 'Suspendre'}
        tone="destructive"
        requireReason
        reasonLabel="Motif"
        busy={busy}
        onConfirm={handleReject}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

function Field({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Phone }) {
  return (
    <div className="flex gap-2.5">
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
