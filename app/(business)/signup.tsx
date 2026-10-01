import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShopSignupForm, type ShopSignupValues } from '@/components/business';
import { useT } from '@/lib/i18n/useT';
import { BackHeader, Text } from '@/components/ui';
import { vendorsApi } from '@/data/api';
import type { PickedDocument } from '@/lib/validation/merchant';
import { coordinatesFor } from '@/lib/postalGeo';
import { routes } from '@/lib/routes';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Shop registration, in the app.
 *
 * The CDC addendum (v1.1, §02) sent merchants to the administration site for
 * this. The client has since asked for it to stay in the app, so it does — what
 * did not change is that the shop lands `pending` and a human clears it before
 * it appears to a single shopper.
 *
 * On submit it `replace`s itself with the confirmation screen rather than
 * returning: the tabs behind do swap themselves from "inscrivez votre boutique"
 * to "demande en attente" (`useOwnerVendor` re-reads on focus), but being
 * silently dropped back onto them reads as a form that failed. `replace`, not
 * `push`, so a filled-in form cannot be stepped back into and submitted twice.
 */
export default function ShopSignupScreen() {
  const t = useT();
  const user = useSessionStore((s) => s.user);

  async function submit(values: ShopSignupValues) {
    if (!user) return;
    const { street, city, postalCode, deliveryEtaMin } = values.address;
    const { documents, payout } = values;

    // Uploaded only now, all together, so stepping back through the form never
    // strands a file in Storage. Each one is a signed-URL hop the API chose the
    // path for; `vendor_apply` refuses any path with nothing behind it.
    const upload = (kind: vendorsApi.RegistrationDocumentKind, doc: PickedDocument | null) =>
      doc ? vendorsApi.uploadRegistrationDocument(kind, doc) : Promise.resolve(undefined);
    const [idDocumentPath, businessNumberDocumentPath, mapaqDocumentPath, bankDocumentPath] = await Promise.all([
      upload('id', documents.idDocument),
      upload('business_number', documents.registrationProof),
      upload('mapaq', documents.mapaqPermit),
      upload('bank', payout.payoutMethod === 'bank_document' ? payout.bankDocument : null),
    ]);

    await vendorsApi.submitShopApplication({
      ownerId: user.id,
      name: values.identity.name,
      vendorType: values.identity.vendorType,
      specialtyId: values.identity.specialtyId,
      isHalalCertified: values.identity.isHalalCertified,
      address: {
        id: `addr_${user.id}_shop`,
        label: values.identity.name,
        street,
        city,
        postalCode,
        // The same offline geocoder the customer address book uses — a shop at
        // `0,0` would sit off the coast of Africa and break every distance and
        // every dispatch ranking that reads it.
        ...coordinatesFor(postalCode, city),
        isDefault: true,
      },
      deliveryEtaMin: Number(deliveryEtaMin),
      registration: {
        legalName: documents.legalName,
        ...(documents.neq ? { neq: documents.neq } : {}),
        gstNumber: documents.gstNumber,
        qstNumber: documents.qstNumber,
        contactName: documents.contactName,
        contactPhone: documents.contactPhone,
        mapaqNumber: documents.mapaqNumber,
        mapaqExpiresOn: documents.mapaqExpiresOn,
        payoutMethod: payout.payoutMethod,
        // Required by the schema, so present — narrowed for the compiler.
        idDocumentPath: idDocumentPath!,
        mapaqDocumentPath: mapaqDocumentPath!,
        ...(businessNumberDocumentPath ? { businessNumberDocumentPath } : {}),
        ...(bankDocumentPath ? { bankDocumentPath } : {}),
      },
    });
    router.replace(routes.businessSignupConfirmed);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('business.signup.title')} />
      <View className="px-5 pb-1">
        <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
            {t('business.signup.privacyNote')}
        </Text>
      </View>
      <ShopSignupForm onSubmit={submit} />
    </SafeAreaView>
  );
}
