import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourierSignupForm, type CourierSignupValues } from '@/components/courier';
import { BackHeader, Text } from '@/components/ui';
import { couriersApi } from '@/data/api';
import { coordinatesFor } from '@/lib/postalGeo';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * The livreur's registration file.
 *
 * Unlike a shop, this happens in the app — there is no catalogue to build and no
 * storefront to publish, just a person and a vehicle. What it shares with the
 * merchant path is the ending: the file lands in the admin queue with status
 * `pending` and waits on a human (CDC addendum v1.1, §04).
 *
 * On submit it does not navigate: `useCourierProfile` re-reads the file when the
 * tabs regain focus and `CourierGate` swaps from "complétez votre dossier" to
 * "dossier en attente" on its own. Going back is enough.
 */
export default function CourierSignupScreen() {
  const user = useSessionStore((s) => s.user);

  async function submit(values: CourierSignupValues) {
    if (!user) return;
    await couriersApi.submitApplication({
      userId: user.id,
      fullName: values.identity.fullName,
      phone: values.identity.phone,
      vehicle: values.vehicle.vehicle,
      ...(values.vehicle.plate ? { plate: values.vehicle.plate } : {}),
      city: values.identity.city,
      // The postal code is the only location the form asks for, and a courier
      // ranked from `0,0` would be somewhere off the coast of Africa. The same
      // offline geocoder the address book uses turns it into a real centroid.
      base: coordinatesFor(values.identity.postalCode, values.identity.city),
    });
    router.back();
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Devenir livreur" />
      <View className="px-5 pb-1">
        <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
          Ces informations sont transmises à Sougouba pour validation. Rien n’est publié.
        </Text>
      </View>
      <CourierSignupForm defaultFullName={user?.fullName} onSubmit={submit} />
    </SafeAreaView>
  );
}
