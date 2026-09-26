import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourierSignupForm, type CourierSignupValues } from '@/components/courier';
import { useT } from '@/lib/i18n/useT';
import { BackHeader, Text } from '@/components/ui';
import { couriersApi } from '@/data/api';
import { coordinatesFor } from '@/lib/postalGeo';
import { routes } from '@/lib/routes';
import { isMotorised } from '@/lib/validation/courier';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * The livreur's registration file.
 *
 * Unlike a shop, this happens in the app — there is no catalogue to build and no
 * storefront to publish, just a person and a vehicle. What it shares with the
 * merchant path is the ending: the file lands in the admin queue with status
 * `pending` and waits on a human (CDC addendum v1.1, §04).
 *
 * On submit it `replace`s itself with the confirmation screen. `CourierGate`
 * does swap from "complétez votre dossier" to "dossier en attente" on its own
 * (`useCourierProfile` re-reads on focus), but being returned to it without a
 * word reads as a form that failed rather than one that was sent.
 */
export default function CourierSignupScreen() {
  const t = useT();
  const user = useSessionStore((s) => s.user);

  async function submit(values: CourierSignupValues) {
    if (!user) return;
    const { identity, vehicle, payout } = values;
    // Everything the three steps collected, not just the first two. The licence
    // number and the whole payout step used to be validated and then dropped on
    // the floor here — the courier answered questions nothing ever stored, and
    // the insurance added at the client's request would have gone the same way.
    const motorised = isMotorised(vehicle.vehicle);
    await couriersApi.submitApplication({
      userId: user.id,
      fullName: identity.fullName,
      phone: identity.phone,
      vehicle: vehicle.vehicle,
      ...(motorised && vehicle.plate ? { plate: vehicle.plate } : {}),
      ...(motorised && vehicle.licenceNumber ? { licenceNumber: vehicle.licenceNumber } : {}),
      ...(motorised && vehicle.insurerName && vehicle.insurancePolicy && vehicle.insuranceExpiry
        ? {
            insurance: {
              insurerName: vehicle.insurerName,
              policyNumber: vehicle.insurancePolicy,
              expiry: vehicle.insuranceExpiry,
            },
          }
        : {}),
      payout: {
        bankId: payout.bankId,
        ...(payout.bankNameOther ? { bankNameOther: payout.bankNameOther } : {}),
        transit: payout.transit,
        account: payout.account,
      },
      city: identity.city,
      postalCode: identity.postalCode,
      // The postal code is the only location the form asks for, and a courier
      // ranked from `0,0` would be somewhere off the coast of Africa. The same
      // offline geocoder the address book uses turns it into a real centroid.
      base: coordinatesFor(identity.postalCode, identity.city),
    });
    router.replace(routes.courierSignupConfirmed);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Devenir livreur" />
      <View className="px-5 pb-1">
        <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('courier.signup.note')}
        </Text>
      </View>
      <CourierSignupForm defaultFullName={user?.fullName} onSubmit={submit} />
    </SafeAreaView>
  );
}
