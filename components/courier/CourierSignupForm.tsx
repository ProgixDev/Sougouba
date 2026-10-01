import { Check } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { Button, CitySelect, Input, SelectField, Text } from '@/components/ui';
import { OTHER_BANK_ID, banks } from '@/data/banks';
import { useThemeColors } from '@/hooks/useColorScheme';
import { i18nResolver } from '@/lib/validation/resolver';
import { useT } from '@/lib/i18n/useT';
import {
  VEHICLE_KEYS,
  courierIdentitySchema,
  courierPayoutSchema,
  courierVehicleSchema,
  isMotorised,
  type CourierIdentityInput,
  type CourierIdentityValues,
  type CourierPayoutValues,
  type CourierVehicleValues,
} from '@/lib/validation/courier';

/** Institution numbers are what a direct-deposit slip prints; show them. */
const BANK_OPTIONS = banks.map((bank) => ({
  value: bank.id,
  label: bank.name,
  ...(bank.code ? { detail: `Institution ${bank.code}` } : {}),
}));

export interface CourierSignupValues {
  identity: CourierIdentityValues;
  vehicle: CourierVehicleValues;
  payout: CourierPayoutValues;
}

export interface CourierSignupFormProps {
  defaultFullName?: string;
  onSubmit: (values: CourierSignupValues) => Promise<void>;
}

/**
 * Keys, not sentences: this is module scope, so a `t()` here would resolve once
 * at import and freeze the launch language for the life of the process.
 */
const STEP_KEYS = ['identity', 'vehicle', 'payout'] as const;

/**
 * Registration, in three steps rather than one long scroll.
 *
 * Each step is its own `useForm` with its own schema, so leaving a step
 * validates it there and then. One combined form would hold every error until
 * the last screen and then drop eleven of them at once on someone who has
 * already forgotten what they typed on the first.
 *
 * The steps are independent forms, so answers survive going back — going back
 * to change a vehicle must not silently clear a bank account.
 */
export function CourierSignupForm({ defaultFullName, onSubmit }: CourierSignupFormProps) {
  const t = useT();
  const colors = useThemeColors();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<CourierIdentityValues | null>(null);
  const [vehicle, setVehicle] = useState<CourierVehicleValues | null>(null);

  const identityForm = useForm<CourierIdentityInput, unknown, CourierIdentityValues>({
    resolver: i18nResolver(t, courierIdentitySchema),
    // Montréal rather than blank: it is where most of the fleet is, and the
    // selector shows the alternatives anyway.
    defaultValues: { fullName: defaultFullName ?? '', phone: '', city: 'Montréal', postalCode: '' },
  });
  const vehicleForm = useForm<CourierVehicleValues>({
    resolver: i18nResolver(t, courierVehicleSchema),
    defaultValues: {
      vehicle: 'bike',
      plate: '',
      licenceNumber: '',
      insurerName: '',
      insurancePolicy: '',
      insuranceExpiry: '',
    },
  });
  const payoutForm = useForm<CourierPayoutValues>({
    resolver: i18nResolver(t, courierPayoutSchema),
    defaultValues: { bankId: '', bankNameOther: '', transit: '', account: '' },
  });

  const chosenVehicle = vehicleForm.watch('vehicle');
  const chosenBank = payoutForm.watch('bankId');

  async function finish(payout: CourierPayoutValues) {
    if (!identity || !vehicle) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({ identity, vehicle, payout });
    } catch {
      setFormError(t('courier.sendFailed'));
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 24 }}
      >
        {/* Three segments rather than "Étape 2 sur 3": the same information,
            and it shows how much is left without asking anyone to read it. */}
        <View className="gap-2.5">
          <View className="flex-row gap-1.5">
            {STEP_KEYS.map((title, index) => (
              <MotiView
                key={title}
                className="flex-1 h-1 rounded-full"
                animate={{ backgroundColor: index <= step ? colors.secondary : colors.border }}
                transition={{ type: 'timing', duration: 220 }}
              />
            ))}
          </View>
          <Text variant="label" tone="muted" className="text-[10px]">
            {t('common.stepLabel', {
              step: step + 1,
              title: t(`courier.signupSteps.${STEP_KEYS[step]}`),
            })}
          </Text>
        </View>

        {step === 0 ? (
          <View className="gap-4">
            <Controller
              control={identityForm.control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('auth.field.fullName')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={identityForm.formState.errors.fullName?.message}
                  required
                />
              )}
            />
            <Controller
              control={identityForm.control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('courier.signupForm.phone')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  error={identityForm.formState.errors.phone?.message}
                  required
                />
              )}
            />
            <Controller
              control={identityForm.control}
              name="city"
              render={({ field: { onChange, value } }) => (
                <CitySelect
                  value={value}
                  onChange={onChange}
                  error={identityForm.formState.errors.city?.message}
                  helperText={t('courier.signupForm.cityHint')}
                />
              )}
            />
            <Controller
              control={identityForm.control}
              name="postalCode"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.postalCode')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  error={identityForm.formState.errors.postalCode?.message}
                  required
                  helperText={t('courier.signupForm.postalHint')}
                />
              )}
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View className="gap-5">
            <View className="gap-3">
              <Text variant="label" tone="muted">
                {t('courier.signupForm.howDoYouDeliver')}
              </Text>
              <Controller
                control={vehicleForm.control}
                name="vehicle"
                render={({ field: { onChange, value } }) => (
                  <View className="flex-row gap-2.5">
                    {(Object.keys(VEHICLE_KEYS) as (keyof typeof VEHICLE_KEYS)[]).map((key) => {
                      const selected = value === key;
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => onChange(key)}
                          className={`flex-1 h-14 rounded-2xl border-[1.5px] items-center justify-center flex-row gap-2 ${
                            selected ? 'border-secondary bg-secondary/10' : 'border-border bg-card'
                          }`}
                        >
                          <Text variant="caption" weight={selected ? 'bold' : 'medium'}>
                            {t(VEHICLE_KEYS[key])}
                          </Text>
                          {selected ? (
                            <Check size={14} color={colors.secondary} strokeWidth={3} />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              />
            </View>

            {/* A bike needs neither, and asking for a plate you cannot have is
                how a form teaches someone it was not written for them. */}
            {!isMotorised(chosenVehicle) ? (
              <View className="rounded-2xl border border-border p-4">
                <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('courier.signupForm.bikeNote')}
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                <Controller
                  control={vehicleForm.control}
                  name="plate"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t('courier.signupForm.plate')}
                      value={value ?? ''}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      autoCapitalize="characters"
                      error={vehicleForm.formState.errors.plate?.message}
                      required
                    />
                  )}
                />
                <Controller
                  control={vehicleForm.control}
                  name="licenceNumber"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t('courier.signupForm.licence')}
                      value={value ?? ''}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      autoCapitalize="characters"
                      error={vehicleForm.formState.errors.licenceNumber?.message}
                      required
                    />
                  )}
                />

                {/* Asked for here rather than promised for later: a motorised
                    courier without cover is the one file an administrator
                    cannot approve, and finding that out a day later wastes
                    everybody's. */}
                <Text variant="label" tone="muted">
                  {t('courier.signupForm.vehicleInsurance')}
                </Text>
                <Controller
                  control={vehicleForm.control}
                  name="insurerName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t('courier.signupForm.insurer')}
                      value={value ?? ''}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={vehicleForm.formState.errors.insurerName?.message}
                      required
                    />
                  )}
                />
                <Controller
                  control={vehicleForm.control}
                  name="insurancePolicy"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t('courier.signupForm.policy')}
                      value={value ?? ''}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      autoCapitalize="characters"
                      error={vehicleForm.formState.errors.insurancePolicy?.message}
                      required
                    />
                  )}
                />
                <Controller
                  control={vehicleForm.control}
                  name="insuranceExpiry"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t('courier.signupForm.expiry')}
                      value={value ?? ''}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      keyboardType="numbers-and-punctuation"
                      error={vehicleForm.formState.errors.insuranceExpiry?.message}
                      required
                      helperText={t('courier.signupForm.insuranceNote')}
                    />
                  )}
                />
              </View>
            )}
          </View>
        ) : null}

        {step === 2 ? (
          <View className="gap-4">
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('courier.signupForm.payoutNote')}
            </Text>
            <Controller
              control={payoutForm.control}
              name="bankId"
              render={({ field: { onChange, value } }) => (
                <SelectField
                  label={t('courier.signupForm.bankName')}
                  sheetTitle={t('courier.yourBank')}
                  options={BANK_OPTIONS}
                  value={value}
                  onChange={onChange}
                  placeholder={t('courier.signupForm.chooseBank')}
                  error={payoutForm.formState.errors.bankId?.message}
                  required
                />
              )}
            />
            {/* "Autre" is the escape hatch, not the default — everything above
                it is a bank whose institution number we already hold. */}
            {chosenBank === OTHER_BANK_ID ? (
              <Controller
                control={payoutForm.control}
                name="bankNameOther"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('courier.signupForm.bankOther')}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={payoutForm.formState.errors.bankNameOther?.message}
                    required
                  />
                )}
              />
            ) : null}
            <Controller
              control={payoutForm.control}
              name="transit"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('courier.signupForm.transit')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  error={payoutForm.formState.errors.transit?.message}
                  required
                />
              )}
            />
            <Controller
              control={payoutForm.control}
              name="account"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('courier.signupForm.account')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  error={payoutForm.formState.errors.account?.message}
                  required
                />
              )}
            />
          </View>
        ) : null}

        {formError ? (
          <Text variant="caption" tone="destructive">
            {formError}
          </Text>
        ) : null}

        <View className="gap-2">
          <Button
            label={step === 2 ? t('courier.signupForm.submit') : t('common.continue')}
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={() => {
              if (step === 0) {
                identityForm.handleSubmit((values) => {
                  setIdentity(values);
                  setStep(1);
                })();
              } else if (step === 1) {
                vehicleForm.handleSubmit((values) => {
                  setVehicle(values);
                  setStep(2);
                })();
              } else {
                payoutForm.handleSubmit(finish)();
              }
            }}
          />
          {step > 0 ? (
            <Button
              label={t('common.ui.back')}
              variant="ghost"
              size="md"
              fullWidth
              disabled={submitting}
              onPress={() => setStep((s) => s - 1)}
            />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
