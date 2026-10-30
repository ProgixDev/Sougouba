import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Check, Home, LocateFixed, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { cityForPostalCode, cityNames, normalizePostalCode } from '@/data/cities';
import type { Address } from '@/data/types';
import { useAddressBook } from '@/hooks/useAddressBook';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import type { AddressInput } from '@/lib/validation/profile';

import { AddressForm, SheetModal } from './AddressFormSheet';

/** A cold GPS start can take a while indoors; the sheet should not spin forever on it. */
const FIX_TIMEOUT_MS = 10_000;

type Notice = 'permissionDenied' | 'locationFailed' | 'notServed';

/**
 * Where the shopper wants delivery, chosen from the home header.
 *
 * The header used to print "Montréal, QC" for everyone, a string from the
 * translation file, while the distances under it were measured from the
 * shopper's default address. The two could disagree, and nothing let the
 * shopper say where they actually were.
 *
 * Three ways in: the phone's position, reverse-geocoded on the device and
 * handed to the ordinary address form to confirm (the server still geocodes and
 * checks the city on save, so nothing here is trusted); one of their saved
 * addresses; or a new one typed by hand. Whichever they pick becomes the default,
 * which is the one `deliveryAddressFor` measures every distance from.
 */
export function AddressPickerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const book = useAddressBook();
  const [form, setForm] = useState<{ initial: Partial<AddressInput> } | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const defaultLabel = t('customer.addressPicker.defaultLabel');
  const nextLabel = book.addresses.some((a) => a.label === defaultLabel) ? '' : defaultLabel;

  function close() {
    setForm(null);
    setNotice(null);
    onClose();
  }

  async function useCurrentLocation() {
    setNotice(null);
    setLocating(true);
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      const granted =
        permission.granted ||
        (permission.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
      if (!granted) {
        setNotice('permissionDenied');
        return;
      }

      const fix =
        (await Location.getLastKnownPositionAsync({ maxAge: 120_000 })) ??
        (await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
        ]));
      if (!fix) {
        setNotice('locationFailed');
        return;
      }

      const [place] = await Location.reverseGeocodeAsync({
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      });
      if (!place) {
        setNotice('locationFailed');
        return;
      }

      // The postal code decides the city — it can only belong to one, while the
      // geocoder's `city` may say "Montreal" without the accent, or name a
      // borough. The name is the fallback for a place that returned no code.
      const postalCode = place.postalCode ? normalizePostalCode(place.postalCode) : '';
      const city =
        cityForPostalCode(postalCode) ?? cityNames.find((name) => sameCity(name, place.city));
      if (!city || (place.isoCountryCode && place.isoCountryCode !== 'CA')) {
        setNotice('notServed');
        return;
      }

      const street = [place.streetNumber, place.street].filter(Boolean).join(' ');
      setForm({ initial: { label: nextLabel, street, city, postalCode } });
    } catch {
      setNotice('locationFailed');
    } finally {
      setLocating(false);
    }
  }

  async function choose(address: Address) {
    if (!address.isDefault && !(await book.makeDefault(address))) return;
    Haptics.selectionAsync();
    close();
  }

  return (
    <SheetModal visible={visible} onClose={close}>
      {form ? (
        <AddressForm
          address={null}
          initial={form.initial}
          saving={book.saving}
          onCancel={() => setForm(null)}
          onSave={async (values) => {
            if (!(await book.save(values, null, { asDefault: true }))) return;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            close();
          }}
        />
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pt-3 gap-3"
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          style={{ maxHeight: 560 }}
        >
          <Text variant="subtitle" weight="bold" className="text-[20px]">
            {t('customer.addressPicker.title')}
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={locating}
            onPress={useCurrentLocation}
            className="flex-row items-center gap-3 rounded-[20px] bg-primary/10 p-4 active:opacity-80"
          >
            <View className="w-10 h-10 items-center justify-center rounded-full bg-primary">
              {locating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <LocateFixed size={19} color="#fff" strokeWidth={2.2} />
              )}
            </View>
            <View className="flex-1">
              <Text variant="body" weight="bold" tone="primary">
                {locating ? t('customer.addressPicker.locating') : t('customer.addressPicker.useCurrentLocation')}
              </Text>
              <Text variant="caption" tone="muted" className="text-[13px]">
                {t('customer.addressPicker.useCurrentLocationHint')}
              </Text>
            </View>
          </Pressable>

          {notice ? (
            <View className="rounded-[16px] bg-muted p-3.5 gap-2">
              <Text variant="caption" className="text-[13px]">
                {notice === 'notServed'
                  ? t('customer.addressPicker.notServed', { cities: cityNames.join(', ') })
                  : t(`customer.addressPicker.${notice}`)}
              </Text>
              {notice === 'permissionDenied' ? (
                <Pressable hitSlop={6} accessibilityRole="button" onPress={() => void Linking.openSettings()}>
                  <Text variant="caption" weight="bold" tone="primary" className="text-[13px]">
                    {t('customer.addressPicker.openSettings')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {book.addresses.length > 0 ? (
            <Text variant="label" tone="muted" className="mt-2">
              {t('customer.addressPicker.savedTitle')}
            </Text>
          ) : null}
          {book.addresses.map((address) => (
            <Pressable
              key={address.id}
              accessibilityRole="button"
              accessibilityState={{ selected: address.isDefault }}
              onPress={() => choose(address)}
              className={`flex-row items-center gap-3 rounded-[20px] p-4 active:opacity-80 ${
                address.isDefault ? 'bg-card border-[1.5px] border-primary' : 'bg-muted'
              }`}
            >
              <View className="w-9 h-9 items-center justify-center rounded-full bg-card">
                <Home size={17} color={address.isDefault ? colors.primary : colors.mutedForeground} strokeWidth={2} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text variant="caption" weight="bold" numberOfLines={1}>
                  {address.label}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1} className="text-[13px]">
                  {address.street}, {address.city}
                </Text>
              </View>
              {address.isDefault ? <Check size={18} color={colors.primary} strokeWidth={2.4} /> : null}
            </Pressable>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => setForm({ initial: { label: nextLabel } })}
            className="mt-1 h-12 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-border"
          >
            <Plus size={17} color={colors.primary} strokeWidth={2.4} />
            <Text variant="caption" weight="bold" tone="primary">
              {t('customer.account.addresses.add')}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </SheetModal>
  );
}

/** "Montreal" from the geocoder and "Montréal" in the table are the same city. */
function sameCity(a: string, b: string | null): boolean {
  if (!b) return false;
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return fold(a) === fold(b);
}
