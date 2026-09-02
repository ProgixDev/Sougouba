'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Ban, MapPin, Phone, FileText, Star } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { getVendor, getVendorNote, approveVendor, rejectVendor } from '@/lib/api/vendors';
import { vendorStatusMeta } from '@/lib/statusMeta';
import { formatDate } from '@/lib/format';
import type { Vendor } from '@/lib/types';

export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [vendor, setVendor] = useState<Vendor | null | undefined>(undefined);
  const [note, setNote] = useState<string | undefined>();
  const [dialog, setDialog] = useState<'reject' | 'suspend' | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [v, n] = await Promise.all([getVendor(id), getVendorNote(id)]);
    setVendor(v ?? null);
    setNote(n);
  }

  useEffect(() => {
    load();
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
        <Text variant="title">Commerce introuvable</Text>
      </div>
    );
  }

  const meta = vendorStatusMeta(vendor.status);

  async function handleApprove() {
    setBusy(true);
    await approveVendor(vendor!.id);
    setBusy(false);
    toast('success', `${vendor!.name} a été approuvé.`);
    load();
  }

  async function handleReject(reason?: string) {
    setBusy(true);
    await rejectVendor(vendor!.id, reason ?? '');
    setBusy(false);
    setDialog(null);
    toast('info', `${vendor!.name} a été ${vendor!.status === 'pending' ? 'refusé' : 'suspendu'}.`);
    load();
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Commerçants', href: '/merchants' }, { label: vendor.name }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Text as="h1" variant="display">
              {vendor.name}
            </Text>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <Text variant="body" tone="muted" className="mt-1">
            {vendor.specialtyFr} · {vendor.vendorType === 'restaurant' ? 'Restaurant' : 'Épicerie'}
          </Text>
        </div>
        <div className="flex gap-2.5">
          {vendor.status !== 'approved' && (
            <Button variant="primary" onClick={handleApprove} disabled={busy}>
              <CheckCircle2 size={16} /> Approuver
            </Button>
          )}
          {vendor.status === 'pending' && (
            <Button variant="destructive" onClick={() => setDialog('reject')} disabled={busy}>
              <XCircle size={16} /> Refuser
            </Button>
          )}
          {vendor.status === 'approved' && (
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
            Dossier d&apos;inscription
          </Text>
          {vendor.registration ? (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Numéro d'entreprise (NEQ)" value={vendor.registration.neq} icon={FileText} />
              <Field label="Personne responsable" value={vendor.registration.contactName} icon={FileText} />
              <Field label="Téléphone" value={vendor.registration.contactPhone} icon={Phone} />
              {vendor.registration.mapaqNumber && <Field label="Permis MAPAQ" value={vendor.registration.mapaqNumber} icon={FileText} />}
              <Field label="Soumis le" value={formatDate(vendor.registration.submittedAt)} icon={FileText} />
            </dl>
          ) : (
            <Text variant="body" tone="muted">
              Ce commerce n&apos;a pas de dossier d&apos;inscription (compte antérieur à l&apos;inscription en ligne).
            </Text>
          )}
        </Card>

        <Card className="p-5">
          <Text variant="subtitle" className="mb-4">
            Détails
          </Text>
          <dl className="flex flex-col gap-4">
            <Field label="Adresse" value={`${vendor.address.street}, ${vendor.city}`} icon={MapPin} />
            <Field label="Certifié halal" value={vendor.isHalalCertified ? 'Oui' : 'Non'} icon={FileText} />
            {vendor.status === 'approved' && <Field label="Note" value={`${vendor.rating.toFixed(1)} (${vendor.reviewCount} avis)`} icon={Star} />}
            <Field label="Délai de livraison" value={`${vendor.deliveryEtaMin} min`} icon={FileText} />
          </dl>
        </Card>
      </div>

      <ConfirmDialog
        open={dialog !== null}
        title={dialog === 'reject' ? 'Refuser ce commerce ?' : 'Suspendre ce commerce ?'}
        description={
          dialog === 'reject'
            ? 'Le commerce restera hors ligne et ne pourra pas être trouvé par les clients. Précisez le motif — il aide le commerçant à corriger son dossier.'
            : 'Le commerce sera retiré immédiatement de la plateforme. Précisez le motif de la suspension.'
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

function Field({ label, value, icon: Icon }: { label: string; value: string; icon: typeof FileText }) {
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
