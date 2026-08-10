import { zodResolver } from '@hookform/resolvers/zod';
import * as Haptics from 'expo-haptics';
import { Check, Home, MapPin, Plus, Trash2 } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackHeader, Badge, Button, EmptyState, Input, Reveal, Text } from '@/components/ui';
import type { Address } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { type AddressValues, addressSchema } from '@/lib/validation/profile';
import { useSessionStore } from '@/store/useSessionStore';

export default function AddressesScreen() {
  const colors = useThemeColors();
  const user = useSessionStore((s) => s.user);
  const updateUser = useSessionStore((s) => s.updateUser);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  const addresses = user?.addresses ?? [];

  function persist(next: Address[]) {
    // Exactly one default, always: the checkout screen picks the default and has
    // no other way to decide between two.
    const withDefault =
      next.length > 0 && !next.some((a) => a.isDefault)
        ? next.map((a, i) => ({ ...a, isDefault: i === 0 }))
        : next;
    updateUser({ addresses: withDefault });
  }

  function save(values: AddressValues, existing: Address | null) {
    const normalisedPostal = values.postalCode.toUpperCase().replace(/[ -]/g, '');
    const formatted = `${normalisedPostal.slice(0, 3)} ${normalisedPostal.slice(3)}`;

    if (existing) {
      persist(
        addresses.map((a) =>
          a.id === existing.id ? { ...a, ...values, postalCode: formatted } : a
        )
      );
    } else {
      persist([
        ...addresses,
        {
          ...values,
          postalCode: formatted,
          id: `addr_${Date.now().toString(36)}`,
          // Coordinates are part of the Address shape but nothing in the
          // prototype maps them; a shipped geocoder is out of scope.
          lat: 0,
          lng: 0,
          isDefault: addresses.length === 0,
        },
      ]);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(null);
  }

  function remove(address: Address) {
    Alert.alert('Supprimer cette adresse ?', `${address.label} — ${address.street}`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => persist(addresses.filter((a) => a.id !== address.id)),
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Adresses de livraison" />

      {addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aucune adresse enregistrée"
          description="Ajoutez une adresse pour accélérer vos prochaines commandes."
          actionLabel="Ajouter une adresse"
          onAction={() => setEditing('new')}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-5 pt-2 pb-6 gap-3"
        >
          {addresses.map((address, index) => (
            <Reveal key={address.id} index={index}>
              <View className="rounded-[20px] bg-card p-4 gap-3">
                <View className="flex-row items-start gap-3">
                  <View className="w-9 h-9 items-center justify-center rounded-full bg-muted">
                    <Home size={17} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text variant="caption" weight="bold" numberOfLines={1} className="flex-1">
                        {address.label}
                      </Text>
                      {address.isDefault ? <Badge label="Par défaut" tone="primary" size="sm" /> : null}
                    </View>
                    <Text variant="caption" tone="muted" className="text-[13px]">
                      {address.street}
                    </Text>
                    <Text variant="caption" tone="muted" className="text-[13px]">
                      {address.city} {address.postalCode}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-4 pl-12">
                  <RowAction label="Modifier" onPress={() => setEditing(address)} />
                  {!address.isDefault ? (
                    <RowAction
                      label="Définir par défaut"
                      onPress={() =>
                        persist(addresses.map((a) => ({ ...a, isDefault: a.id === address.id })))
                      }
                    />
                  ) : null}
                  <View className="flex-1" />
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer ${address.label}`}
                    onPress={() => remove(address)}
                  >
                    <Trash2 size={17} color={colors.destructive} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            </Reveal>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing('new')}
            className="mt-1 h-12 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-border"
          >
            <Plus size={17} color={colors.primary} strokeWidth={2.4} />
            <Text variant="caption" weight="bold" tone="primary">
              Ajouter une adresse
            </Text>
          </Pressable>
        </ScrollView>
      )}

      <AddressFormSheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        address={editing === 'new' ? null : editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </SafeAreaView>
  );
}

function RowAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable hitSlop={6} accessibilityRole="button" onPress={onPress}>
      <Text variant="caption" weight="semibold" tone="primary" className="text-[13px]">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Add/edit form.
 *
 * Remounted by key whenever the target changes, so `defaultValues` are read
 * fresh — react-hook-form snapshots them at mount and would otherwise keep
 * showing the first address ever opened.
 */
function AddressFormSheet({
  address,
  visible,
  onClose,
  onSave,
}: {
  address: Address | null;
  visible: boolean;
  onClose: () => void;
  onSave: (values: AddressValues, existing: Address | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: address?.label ?? '',
      street: address?.street ?? '',
      city: address?.city ?? 'Montréal',
      postalCode: address?.postalCode ?? '',
    },
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10, 32, 24, 0.45)' }}
        >
          <Pressable className="flex-1" accessibilityLabel="Fermer" onPress={onClose} />
        </MotiView>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <MotiView
            from={{ translateY: 400 }}
            animate={{ translateY: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 190, mass: 0.9 }}
            className="rounded-t-[28px] bg-card"
          >
            <View className="items-center pt-3 pb-1">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="px-5 pt-3 gap-4"
              style={{ maxHeight: 460 }}
            >
              <Text variant="subtitle" weight="bold" className="text-[20px]">
                {address ? 'Modifier l’adresse' : 'Nouvelle adresse'}
              </Text>

              <Controller
                control={control}
                name="label"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Nom (ex. Domicile)"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.label?.message}
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="street"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Numéro et rue"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.street?.message}
                    autoCapitalize="words"
                    textContentType="fullStreetAddress"
                  />
                )}
              />
              <Controller
                control={control}
                name="city"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Ville"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.city?.message}
                    autoCapitalize="words"
                    textContentType="addressCity"
                  />
                )}
              />
              <Controller
                control={control}
                name="postalCode"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Code postal"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.postalCode?.message}
                    autoCapitalize="characters"
                    textContentType="postalCode"
                  />
                )}
              />
            </ScrollView>

            <View className="px-5 pt-4 gap-2" style={{ paddingBottom: insets.bottom + 12 }}>
              <Button
                label={address ? 'Enregistrer' : 'Ajouter l’adresse'}
                variant="primary"
                size="lg"
                fullWidth
                icon={<Check size={18} color="#fff" strokeWidth={2.4} />}
                onPress={handleSubmit((values) => onSave(values, address))}
              />
              <Button label="Annuler" variant="ghost" size="lg" fullWidth onPress={onClose} />
            </View>
          </MotiView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
