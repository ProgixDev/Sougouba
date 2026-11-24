'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Ban, MapPin, Phone, FileText, Star, ExternalLink, Landmark, CreditCard } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/data/StatusBadge';
import { Skeleton } from '@/components/data/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { getVendor, approveVendor, rejectVendor, suspendVendor } from '@/lib/api/vendors';
import { vendorStatusMeta } from '@/lib/statusMeta';
import { formatCad, formatDate } from '@/lib/format';
import type { AdminVendorDetail } from '@/lib/types';
import { useAdmin } from '@/lib/permissions';

export default function MerchantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAdmin();
  const toast = useToast();

  const [vendor, setVendor] = useState<AdminVendorDetail | null | undefined>(undefined);
  const [dialog, setDialog] = useState<'reject' | 'suspend' | null>(null);
  const [busy, setBusy] = useState(false);

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
    try {
      await approveVendor(vendor!.id);
      toast('success', `${vendor!.name} a été approuvé.`);
    } catch (error) {
      // A 400 here usually means another administrator decided this file while
      // it was open — refetching shows the decision rather than an error the
      // reviewer can do nothing about.
      toast('error', error instanceof Error ? error.message : 'Décision impossible.');
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
      toast('info', `${vendor!.name} a été ${rejecting ? 'refusé' : 'suspendu'}.`);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Décision impossible.');
    }
    setBusy(false);
    setDialog(null);
    load();
  }

  return (
    <div className="mx-auto flex max-w-content flex-col gap-6">
      <Breadcrumbs items={[{ label: 'Commerçants', href: '/merchants' }, { label: vendor.name }]} />

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
            {vendor.vendorType === 'restaurant' ? 'Restaurant' : 'Épicerie'}
          </Text>
        </div>
        {can('vendors.decide') && (
        <div className="flex flex-wrap gap-2.5">
          {vendor.status !== 'approved' && vendor.status !== 'rejected' && (
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
        )}
      </div>

      {vendor.statusReason && (
        <Card elevated={false} className="border-destructive/30 bg-destructive/5 p-4">
          <Text variant="label" tone="destructive">
            Motif du refus / de la suspension
          </Text>
          <Text variant="body" className="mt-1">
            {vendor.statusReason}
          </Text>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Text variant="subtitle" className="mb-4">
            Dossier d&apos;inscription
          </Text>
          {vendor.registration ? (
            <div className="flex flex-col gap-6">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {vendor.registration.legalName && <Field label="Nom légal" value={vendor.registration.legalName} icon={FileText} />}
                <Field label="Numéro d'entreprise (NEQ)" value={vendor.registration.neq ?? 'Non fourni — voir la preuve d’immatriculation'} icon={FileText} />
                {vendor.registration.gstNumber && <Field label="Numéro de TPS" value={vendor.registration.gstNumber} icon={FileText} />}
                {vendor.registration.qstNumber && <Field label="Numéro de TVQ" value={vendor.registration.qstNumber} icon={FileText} />}
                {vendor.registration.mapaqNumber && <Field label="Permis MAPAQ" value={vendor.registration.mapaqNumber} icon={FileText} />}
                {vendor.registration.mapaqExpiresOn && (
                  <Field
                    label="Permis MAPAQ — expiration"
                    // Checked at review time, not only at submission: a file can
                    // sit in the queue past the date it was valid on.
                    value={`${formatDate(vendor.registration.mapaqExpiresOn)}${
                      vendor.registration.mapaqExpiresOn <= new Date().toISOString().slice(0, 10) ? ' — expiré' : ''
                    }`}
                    icon={FileText}
                  />
                )}
                <Field label="Dirigeant autorisé" value={vendor.registration.contactName} icon={FileText} />
                <Field label="Téléphone" value={vendor.registration.contactPhone} icon={Phone} />
                {vendor.registration.payoutMethod && (
                  <Field
                    label="Versements"
                    value={
                      vendor.registration.payoutMethod === 'stripe'
                        ? 'Stripe Connect — à configurer après approbation'
                        : 'Document bancaire joint'
                    }
                    icon={Landmark}
                  />
                )}
                {vendor.registration.submittedAt && <Field label="Soumis le" value={formatDate(vendor.registration.submittedAt)} icon={FileText} />}
              </dl>

              {vendor.registration.documents.length > 0 && (
                <div>
                  <Text variant="label" tone="muted" className="mb-2">
                    Documents joints
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
                            Ouvrir <ExternalLink size={14} />
                          </a>
                        ) : (
                          <Text variant="caption" tone="muted">
                            Lien indisponible — rechargez la page
                          </Text>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Text variant="caption" tone="muted" className="mt-2">
                    Liens valides dix minutes. Rechargez la page pour en obtenir de nouveaux.
                  </Text>
                </div>
              )}
            </div>
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
            {/* Recorded from Stripe, which bills it. Shown for information: it does not gate the shop. */}
            {vendor.subscription && (
              <Field label="Abonnement mensuel" value={subscriptionLabel(vendor.subscription)} icon={CreditCard} />
            )}
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
        onConfirm={handleDecision}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

const DOCUMENT_LABELS: Record<'id' | 'business_number' | 'mapaq' | 'bank', string> = {
  id: 'Pièce d’identité du dirigeant',
  business_number: 'Preuve d’immatriculation',
  mapaq: 'Permis MAPAQ',
  bank: 'Document bancaire',
};

function Field({ label, value, icon: Icon }: { label: string; value: string; icon: typeof FileText }) {
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
  const price = subscription.priceCad === null ? '' : ` — ${formatCad(subscription.priceCad)}/mois`;
  switch (subscription.status) {
    case 'active':
      if (subscription.cancelAt) return `Résilié, actif jusqu’au ${formatDate(subscription.cancelAt)}${price}`;
      return subscription.currentPeriodEnd
        ? `Actif, prochain prélèvement le ${formatDate(subscription.currentPeriodEnd)}${price}`
        : `Actif${price}`;
    case 'past_due':
      return `Paiement en retard${price}`;
    case 'canceled':
      return 'Terminé';
    default:
      return 'Non souscrit';
  }
}
