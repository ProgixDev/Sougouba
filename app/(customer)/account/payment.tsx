import * as Haptics from 'expo-haptics';
import { CreditCard, Plus, ShieldCheck, Trash2 } from 'lucide-react-native';
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
import { useThemeColors } from '@/hooks/useColorScheme';
import { type PaymentValues, paymentSchema } from '@/lib/validation/profile';
import { useT } from '@/lib/i18n/useT';
import { i18nResolver } from '@/lib/validation/resolver';
import {
  usePreferencesStore,
  type PaymentBrand,
  type PaymentMethod,
} from '@/store/usePreferencesStore';

const brandLabels: Record<PaymentBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  interac: 'Interac',
};

/** Issuer identification number, first digit — the standard prefix rule. */
function brandFromNumber(cardNumber: string): PaymentBrand {
  if (cardNumber.startsWith('4')) return 'visa';
  if (/^5[1-5]/.test(cardNumber) || /^2[2-7]/.test(cardNumber)) return 'mastercard';
  return 'interac';
}

export default function PaymentMethodsScreen() {
  const t = useT();
  const colors = useThemeColors();
  const methods = usePreferencesStore((s) => s.paymentMethods);
  const addPaymentMethod = usePreferencesStore((s) => s.addPaymentMethod);
  const removePaymentMethod = usePreferencesStore((s) => s.removePaymentMethod);
  const setDefaultPaymentMethod = usePreferencesStore((s) => s.setDefaultPaymentMethod);

  const [adding, setAdding] = useState(false);

  function save(values: PaymentValues) {
    addPaymentMethod({
      brand: brandFromNumber(values.cardNumber),
      // Only the last four survive the form. Nothing in this prototype has any
      // business holding a full card number, even in memory.
      last4: values.cardNumber.slice(-4),
      expiry: values.expiry,
      holder: values.holder.trim(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAdding(false);
  }

  function remove(method: PaymentMethod) {
    Alert.alert(t('customer.confirmRemoveCard'), `${brandLabels[method.brand]} •••• ${method.last4}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => removePaymentMethod(method.id) },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('customer.account.payment.title')} />

      {methods.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t('customer.account.payment.emptyTitle')}
          description={t('customer.account.payment.emptyBody')}
          actionLabel={t('customer.account.payment.add')}
          onAction={() => setAdding(true)}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName="px-5 pt-2 pb-6 gap-3"
        >
          {methods.map((method, index) => (
            <Reveal key={method.id} index={index}>
              <View className="rounded-[20px] bg-card p-4 gap-3">
                <View className="flex-row items-center gap-3">
                  <View className="w-11 h-11 items-center justify-center rounded-xl bg-muted">
                    <CreditCard size={19} color={colors.mutedForeground} strokeWidth={2} />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text variant="caption" weight="bold">
                        {brandLabels[method.brand]} •••• {method.last4}
                      </Text>
                      {method.isDefault ? <Badge label={t('customer.account.addresses.isDefault')} tone="primary" size="sm" /> : null}
                    </View>
                    <Text variant="caption" tone="muted" className="text-[12px]">
                      {method.holder} · expire {method.expiry}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.a11y.removeCard', { last4: method.last4 })}
                    onPress={() => remove(method)}
                  >
                    <Trash2 size={17} color={colors.destructive} strokeWidth={2} />
                  </Pressable>
                </View>

                {!method.isDefault ? (
                  <Pressable
                    hitSlop={6}
                    accessibilityRole="button"
                    onPress={() => setDefaultPaymentMethod(method.id)}
                    className="pl-14"
                  >
                    <Text variant="caption" weight="semibold" tone="primary" className="text-[13px]">
                      {t('customer.account.addresses.setDefault')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Reveal>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            className="mt-1 h-12 flex-row items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed border-border"
          >
            <Plus size={17} color={colors.primary} strokeWidth={2.4} />
            <Text variant="caption" weight="bold" tone="primary">
              {t('customer.account.payment.add')}
            </Text>
          </Pressable>

          <View className="mt-3 flex-row items-start gap-2.5 px-1">
            <ShieldCheck size={15} color={colors.mutedForeground} strokeWidth={2} />
            <Text variant="caption" tone="muted" className="flex-1 text-[12px] leading-[17px]">
          {t('customer.account.payment.footnote')}
            </Text>
          </View>
        </ScrollView>
      )}

      <AddCardSheet visible={adding} onClose={() => setAdding(false)} onSave={save} />
    </SafeAreaView>
  );
}

function AddCardSheet({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (values: PaymentValues) => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PaymentValues>({
    resolver: i18nResolver(t, paymentSchema),
    defaultValues: { holder: '', cardNumber: '', expiry: '' },
  });

  function close() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View className="flex-1 justify-end">
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 180 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10, 32, 24, 0.45)' }}
        >
          <Pressable className="flex-1" accessibilityLabel={t('common.ui.close', { label: '' })} onPress={close} />
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
              style={{ maxHeight: 420 }}
            >
              <Text variant="subtitle" weight="bold" className="text-[20px]">
                {t('customer.account.payment.newCard')}
              </Text>

              <Controller
                control={control}
                name="holder"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('customer.account.payment.fieldHolder')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.holder?.message}
                    autoCapitalize="words"
                    textContentType="name"
                  />
                )}
              />
              <Controller
                control={control}
                name="cardNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('customer.account.payment.fieldNumber')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.cardNumber?.message}
                    keyboardType="number-pad"
                    maxLength={19}
                  />
                )}
              />
              <Controller
                control={control}
                name="expiry"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('customer.account.payment.fieldExpiry')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.expiry?.message}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                )}
              />
            </ScrollView>

            <View className="px-5 pt-4 gap-2" style={{ paddingBottom: insets.bottom + 12 }}>
              <Button
                label={t('customer.account.payment.submit')}
                variant="primary"
                size="lg"
                fullWidth
                onPress={handleSubmit((values) => {
                  onSave(values);
                  reset();
                })}
              />
              <Button label={t('common.cancel')} variant="ghost" size="lg" fullWidth onPress={close} />
            </View>
          </MotiView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
