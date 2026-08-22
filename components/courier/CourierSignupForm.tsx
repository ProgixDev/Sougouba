import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { Button, CitySelect, Input, SelectField, Text } from '@/components/ui';
import { OTHER_BANK_ID, banks } from '@/data/banks';
import { useThemeColors } from '@/hooks/useColorScheme';
import {
  VEHICLE_LABELS,
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

const STEP_TITLES = ['Vous et votre ville', 'Votre véhicule', 'Vos versements'];

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
  const colors = useThemeColors();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<CourierIdentityValues | null>(null);
  const [vehicle, setVehicle] = useState<CourierVehicleValues | null>(null);

  const identityForm = useForm<CourierIdentityInput, unknown, CourierIdentityValues>({
    resolver: zodResolver(courierIdentitySchema),
    // Montréal rather than blank: it is where most of the fleet is, and the
    // selector shows the alternatives anyway.
    defaultValues: { fullName: defaultFullName ?? '', phone: '', city: 'Montréal', postalCode: '' },
  });
  const vehicleForm = useForm<CourierVehicleValues>({
    resolver: zodResolver(courierVehicleSchema),
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
    resolver: zodResolver(courierPayoutSchema),
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
      setFormError('Envoi impossible. Veuillez réessayer.');
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
            {STEP_TITLES.map((title, index) => (
              <MotiView
                key={title}
                className="flex-1 h-1 rounded-full"
                animate={{ backgroundColor: index <= step ? colors.secondary : colors.border }}
                transition={{ type: 'timing', duration: 220 }}
              />
            ))}
          </View>
          <Text variant="label" tone="muted" className="text-[10px]">
            Étape {step + 1} — {STEP_TITLES[step]}
          </Text>
        </View>

        {step === 0 ? (
          <View className="gap-4">
            <Controller
              control={identityForm.control}
              name="fullName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Nom complet"
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
                  label="Téléphone"
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
                  helperText="Les villes où Sougouba a des courses aujourd’hui."
                />
              )}
            />
            <Controller
              control={identityForm.control}
              name="postalCode"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Code postal"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  error={identityForm.formState.errors.postalCode?.message}
                  required
                  helperText="Doit correspondre à la ville choisie. Sert à vous proposer les courses près de chez vous."
                />
              )}
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View className="gap-5">
            <View className="gap-3">
              <Text variant="label" tone="muted">
                Comment livrez-vous ?
              </Text>
              <Controller
                control={vehicleForm.control}
                name="vehicle"
                render={({ field: { onChange, value } }) => (
                  <View className="flex-row gap-2.5">
                    {(Object.keys(VEHICLE_LABELS) as (keyof typeof VEHICLE_LABELS)[]).map((key) => {
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
                            {VEHICLE_LABELS[key]}
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
                  Aucun document de véhicule n’est demandé pour une livraison à vélo. Une pièce
                  d’identité vous sera demandée à la validation.
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                <Controller
                  control={vehicleForm.control}
                  name="plate"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Plaque d’immatriculation"
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
                      label="Numéro de permis de conduire"
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
                  Assurance du véhicule
                </Text>
                <Controller
                  control={vehicleForm.control}
                  name="insurerName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Compagnie d’assurance"
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
                      label="Numéro de police"
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
                      label="Échéance (MM/AAAA)"
                      value={value ?? ''}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      keyboardType="numbers-and-punctuation"
                      error={vehicleForm.formState.errors.insuranceExpiry?.message}
                      required
                      helperText="Une preuve d’assurance vous sera demandée à la validation."
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
              Vos gains sont versés par dépôt direct. Ces informations restent visibles de vous
              seul.
            </Text>
            <Controller
              control={payoutForm.control}
              name="bankId"
              render={({ field: { onChange, value } }) => (
                <SelectField
                  label="Nom de la banque"
                  sheetTitle="Votre banque"
                  options={BANK_OPTIONS}
                  value={value}
                  onChange={onChange}
                  placeholder="Choisir votre banque"
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
                    label="Nom de votre banque"
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
                  label="Transit (5 chiffres)"
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
                  label="Numéro de compte"
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
            label={step === 2 ? 'Envoyer mon dossier' : 'Continuer'}
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
              label="Retour"
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
