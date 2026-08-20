import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';

import { Button, Input, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import {
  VENDOR_TYPE_LABELS,
  shopAddressSchema,
  shopDocumentsSchema,
  shopIdentitySchema,
  type ShopAddressInput,
  type ShopAddressValues,
  type ShopDocumentsInput,
  type ShopDocumentsValues,
  type ShopIdentityValues,
} from '@/lib/validation/merchant';

export interface ShopSignupValues {
  identity: ShopIdentityValues;
  address: ShopAddressValues;
  documents: ShopDocumentsValues;
}

export interface ShopSignupFormProps {
  onSubmit: (values: ShopSignupValues) => Promise<void>;
}

const STEP_TITLES = ['Votre commerce', 'Adresse et livraison', 'Documents'];

/**
 * Shop registration, in the app.
 *
 * Same three-step shape as `components/courier/CourierSignupForm.tsx`, on
 * purpose: the two paths off the role gate should not feel like two products.
 * Each step is its own `useForm` with its own schema, so answers survive going
 * back and errors land where they were made.
 */
export function ShopSignupForm({ onSubmit }: ShopSignupFormProps) {
  const colors = useThemeColors();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<ShopIdentityValues | null>(null);
  const [address, setAddress] = useState<ShopAddressValues | null>(null);

  const identityForm = useForm<ShopIdentityValues>({
    resolver: zodResolver(shopIdentitySchema),
    defaultValues: {
      name: '',
      vendorType: 'grocery',
      specialtyFr: '',
      isHalalCertified: false,
    },
  });
  const addressForm = useForm<ShopAddressInput, unknown, ShopAddressValues>({
    resolver: zodResolver(shopAddressSchema),
    defaultValues: {
      street: '',
      city: 'Montréal',
      postalCode: '',
      deliveryFeeCad: '',
      deliveryEtaMin: '',
    },
  });
  const documentsForm = useForm<ShopDocumentsInput, unknown, ShopDocumentsValues>({
    resolver: zodResolver(shopDocumentsSchema),
    defaultValues: {
      neq: '',
      contactName: '',
      contactPhone: '',
      mapaqNumber: '',
      vendorType: 'grocery',
    },
  });

  const chosenType = identityForm.watch('vendorType');

  async function finish(documents: ShopDocumentsValues) {
    if (!identity || !address) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({ identity, address, documents });
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
                animate={{ backgroundColor: index <= step ? colors.primary : colors.border }}
                transition={{ type: 'timing', duration: 220 }}
              />
            ))}
          </View>
          <Text variant="label" tone="muted" className="text-[10px]">
            Étape {step + 1} — {STEP_TITLES[step]}
          </Text>
        </View>

        {step === 0 ? (
          <View className="gap-5">
            <Controller
              control={identityForm.control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Nom de la boutique"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={identityForm.formState.errors.name?.message}
                  required
                />
              )}
            />

            <View className="gap-3">
              <Text variant="label" tone="muted">
                Catégorie
              </Text>
              {/* The two verticals the catalogue is organised around (CDC
                  addendum v1.1, §01). Not a free-text field: this is what a
                  shopper filters on. */}
              <Controller
                control={identityForm.control}
                name="vendorType"
                render={({ field: { onChange, value } }) => (
                  <View className="flex-row gap-2.5">
                    {(Object.keys(VENDOR_TYPE_LABELS) as (keyof typeof VENDOR_TYPE_LABELS)[]).map(
                      (key) => {
                        const selected = value === key;
                        return (
                          <Pressable
                            key={key}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => {
                              onChange(key);
                              // Mirrored into the documents step so the MAPAQ
                              // rule can see it without the two forms sharing
                              // state.
                              documentsForm.setValue('vendorType', key);
                            }}
                            className={`flex-1 h-14 rounded-2xl border-[1.5px] items-center justify-center flex-row gap-2 ${
                              selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
                            }`}
                          >
                            <Text variant="caption" weight={selected ? 'bold' : 'medium'}>
                              {VENDOR_TYPE_LABELS[key]}
                            </Text>
                            {selected ? (
                              <Check size={14} color={colors.primary} strokeWidth={3} />
                            ) : null}
                          </Pressable>
                        );
                      }
                    )}
                  </View>
                )}
              />
            </View>

            <Controller
              control={identityForm.control}
              name="specialtyFr"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={chosenType === 'restaurant' ? 'Type de cuisine' : 'Spécialité'}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={identityForm.formState.errors.specialtyFr?.message}
                  required
                  helperText={
                    chosenType === 'restaurant'
                      ? 'Ex. « Cuisine sénégalaise » — la ligne sous votre nom dans les listes.'
                      : 'Ex. « Épicerie maghrébine » — la ligne sous votre nom dans les listes.'
                  }
                />
              )}
            />

            <Controller
              control={identityForm.control}
              name="isHalalCertified"
              render={({ field: { onChange, value } }) => (
                <View className="flex-row items-center justify-between gap-4 rounded-2xl bg-card p-4">
                  <View className="flex-1 gap-1">
                    <Text variant="caption" weight="bold">
                      Certifié halal
                    </Text>
                    <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
                      Affiché sur votre fiche. Une preuve de certification peut vous être demandée.
                    </Text>
                  </View>
                  <Switch
                    value={value}
                    onValueChange={onChange}
                    trackColor={{ false: colors.border, true: colors.primary }}
                  />
                </View>
              )}
            />
          </View>
        ) : null}

        {step === 1 ? (
          <View className="gap-4">
            <Controller
              control={addressForm.control}
              name="street"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Adresse"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={addressForm.formState.errors.street?.message}
                  required
                />
              )}
            />
            <Controller
              control={addressForm.control}
              name="city"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Ville"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={addressForm.formState.errors.city?.message}
                  required
                />
              )}
            />
            <Controller
              control={addressForm.control}
              name="postalCode"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Code postal"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  error={addressForm.formState.errors.postalCode?.message}
                  required
                  helperText="Sert à calculer la distance affichée à vos clients."
                />
              )}
            />
            <Controller
              control={addressForm.control}
              name="deliveryFeeCad"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Frais de livraison ($)"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="decimal-pad"
                  error={addressForm.formState.errors.deliveryFeeCad?.message}
                  required
                  helperText="Non taxés, ajoutés au total de la commande."
                />
              )}
            />
            <Controller
              control={addressForm.control}
              name="deliveryEtaMin"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Délai annoncé (minutes)"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  error={addressForm.formState.errors.deliveryEtaMin?.message}
                  required
                />
              )}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View className="gap-4">
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              Un administrateur Sougouba vérifie ces informations avant la mise en ligne de votre
              boutique.
            </Text>
            <Controller
              control={documentsForm.control}
              name="neq"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Numéro d’entreprise (NEQ)"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  error={documentsForm.formState.errors.neq?.message}
                  required
                  helperText="10 chiffres, tel qu’inscrit au Registraire des entreprises."
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="contactName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Personne responsable"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={documentsForm.formState.errors.contactName?.message}
                  required
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="contactPhone"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Téléphone du responsable"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  error={documentsForm.formState.errors.contactPhone?.message}
                  required
                />
              )}
            />
            {/* Only a restaurant needs one, and asking a grocery for a food
                permit is how a form teaches someone it was not written for
                them. */}
            {chosenType === 'restaurant' ? (
              <Controller
                control={documentsForm.control}
                name="mapaqNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Numéro de permis MAPAQ"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="characters"
                    error={documentsForm.formState.errors.mapaqNumber?.message}
                    required
                    helperText="Permis de restauration valide, exigé pour tout restaurant."
                  />
                )}
              />
            ) : null}
            <View className="rounded-2xl border border-border p-4">
              <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
                Une pièce d’identité de la personne responsable vous sera demandée lors de la
                validation.
              </Text>
            </View>
          </View>
        ) : null}

        {formError ? (
          <Text variant="caption" tone="destructive">
            {formError}
          </Text>
        ) : null}

        <View className="gap-2">
          <Button
            label={step === 2 ? 'Envoyer ma demande' : 'Continuer'}
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
                addressForm.handleSubmit((values) => {
                  setAddress(values);
                  setStep(2);
                })();
              } else {
                documentsForm.handleSubmit(finish)();
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
