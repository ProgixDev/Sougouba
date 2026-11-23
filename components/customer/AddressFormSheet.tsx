import { Check } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CitySelect, Input, Text } from '@/components/ui';
import { cityForPostalCode } from '@/data/cities';
import type { DeliveryDetails } from '@/data/api/addresses';
import type { Address } from '@/data/types';
import { useT } from '@/lib/i18n/useT';
import { i18nResolver } from '@/lib/validation/resolver';
import { type AddressInput, type AddressValues, addressSchema } from '@/lib/validation/profile';

import { DeliveryInstructionsForm, instructionsFrom } from './DeliveryInstructionsForm';

/**
 * The bottom-sheet chrome both address sheets share: a dimmed backdrop that
 * closes on tap, and a spring-in panel with a grabber.
 *
 * One `Modal` per sheet, and the picker swaps its contents rather than opening a
 * second one on top — iOS will not present a modal while another is dismissing,
 * and the form simply never appears.
 */
export function SheetModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10, 32, 24, 0.45)' }}
        >
          <Pressable className="flex-1" accessibilityLabel={t('common.ui.close')} onPress={onClose} />
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
            {children}
          </MotiView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export interface AddressFormProps {
  /** The address being edited, or `null` for a new one. */
  address: Address | null;
  /** Prefill for a new address — what the phone's position reverse-geocoded to. */
  initial?: Partial<AddressInput>;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: AddressValues & DeliveryDetails, existing: Address | null) => void;
}

/**
 * Add/edit form, without its sheet.
 *
 * Remount it by key whenever the target changes, so `defaultValues` are read
 * fresh — react-hook-form snapshots them at mount and would otherwise keep
 * showing the first address ever opened.
 *
 * No city is preselected. It used to default to Montréal, which put every new
 * address in Montréal unless the shopper noticed the chip; the postal code now
 * picks the city instead, since it can only belong to one.
 */
export function AddressForm({ address, initial, saving, onCancel, onSave }: AddressFormProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<AddressInput, unknown, AddressValues>({
    resolver: i18nResolver(t, addressSchema),
    defaultValues: {
      label: address?.label ?? initial?.label ?? '',
      street: address?.street ?? initial?.street ?? '',
      city: address?.city ?? initial?.city ?? '',
      postalCode: address?.postalCode ?? initial?.postalCode ?? '',
    },
  });
  // Outside the validated form: every field is optional, and the API bounds them.
  const [details, setDetails] = useState(() => instructionsFrom(address));

  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-5 pt-3 gap-4"
        style={{ maxHeight: 460 }}
      >
        <Text variant="subtitle" weight="bold" className="text-[20px]">
          {address ? t('customer.account.addresses.editTitle') : t('customer.account.addresses.newTitle')}
        </Text>

        <Controller
          control={control}
          name="label"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('customer.account.addresses.fieldLabel')}
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
              label={t('customer.account.addresses.fieldStreet')}
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
          name="postalCode"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('customer.account.addresses.fieldPostalCode')}
              value={value}
              onChangeText={(text) => {
                onChange(text);
                // Only once the FSA is complete, and only to a served city —
                // a half-typed code must not flick the chips around.
                const city = cityForPostalCode(text);
                if (city && city !== getValues('city')) setValue('city', city, { shouldValidate: true });
              }}
              onBlur={onBlur}
              error={errors.postalCode?.message}
              autoCapitalize="characters"
              textContentType="postalCode"
              helperText={t('customer.account.addresses.postalHint')}
            />
          )}
        />
        <Controller
          control={control}
          name="city"
          render={({ field: { onChange, value } }) => (
            <CitySelect value={value} onChange={onChange} error={errors.city?.message} />
          )}
        />

        <View className="gap-3 pt-2">
          <Text variant="label" tone="muted">
            {t('common.deliveryInstructions.title')}
          </Text>
          <DeliveryInstructionsForm value={details} onChange={setDetails} />
        </View>
      </ScrollView>

      <View className="px-5 pt-4 gap-2" style={{ paddingBottom: insets.bottom + 12 }}>
        <Button
          label={address ? t('common.save') : t('customer.account.addresses.submitNew')}
          variant="primary"
          size="lg"
          fullWidth
          loading={saving}
          icon={<Check size={18} color="#fff" strokeWidth={2.4} />}
          onPress={handleSubmit((values) => onSave({ ...values, ...details }, address))}
        />
        <Button label={t('common.cancel')} variant="ghost" size="lg" fullWidth onPress={onCancel} />
      </View>
    </>
  );
}

/** The form in its own sheet — the address book's add/edit flow. */
export function AddressFormSheet({
  visible,
  onClose,
  ...form
}: Omit<AddressFormProps, 'onCancel'> & { visible: boolean; onClose: () => void }) {
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <AddressForm {...form} onCancel={onClose} />
    </SheetModal>
  );
}
