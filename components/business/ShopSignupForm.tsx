import { Check, CreditCard, Landmark } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';

import { Button, CitySelect, Input, Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import {
  VENDOR_TYPE_LABELS,
  shopAddressSchema,
  shopDocumentsSchema,
  shopIdentitySchema,
  shopPayoutSchema,
  type ShopAddressInput,
  type ShopAddressValues,
  type ShopDocumentsInput,
  type ShopDocumentsValues,
  type ShopIdentityValues,
  type ShopPayoutInput,
  type ShopPayoutValues,
} from '@/lib/validation/merchant';

import { DeliveryGrid } from './DeliveryGrid';
import { DocumentField } from './DocumentField';
import { i18nResolver } from '@/lib/validation/resolver';
import { useT } from '@/lib/i18n/useT';

export interface ShopSignupValues {
  identity: ShopIdentityValues;
  address: ShopAddressValues;
  documents: ShopDocumentsValues;
  payout: ShopPayoutValues;
}

export interface ShopSignupFormProps {
  onSubmit: (values: ShopSignupValues) => Promise<void>;
}

/** Keys, not sentences — module scope. See the note in `CourierSignupForm`. */
const STEP_KEYS = ['business', 'address', 'documents', 'payout'] as const;
const LAST_STEP = STEP_KEYS.length - 1;

/**
 * Shop registration, in the app.
 *
 * Same stepped shape as `components/courier/CourierSignupForm.tsx`, on
 * purpose: the two paths off the role gate should not feel like two products.
 * Four steps rather than the courier's three: the client's document list
 * (2026-09-27) made the paperwork step long enough that the bank account
 * earned a step of its own.
 * Each step is its own `useForm` with its own schema, so answers survive going
 * back and errors land where they were made.
 */
export function ShopSignupForm({ onSubmit }: ShopSignupFormProps) {
  const t = useT();
  const colors = useThemeColors();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<ShopIdentityValues | null>(null);
  const [address, setAddress] = useState<ShopAddressValues | null>(null);
  const [documents, setDocuments] = useState<ShopDocumentsValues | null>(null);

  const identityForm = useForm<ShopIdentityValues>({
    resolver: i18nResolver(t, shopIdentitySchema),
    defaultValues: {
      name: '',
      vendorType: 'grocery',
      specialtyFr: '',
      isHalalCertified: false,
    },
  });
  const addressForm = useForm<ShopAddressInput, unknown, ShopAddressValues>({
    resolver: i18nResolver(t, shopAddressSchema),
    defaultValues: {
      street: '',
      city: 'Montréal',
      postalCode: '',
      deliveryEtaMin: '',
    },
  });
  const documentsForm = useForm<ShopDocumentsInput, unknown, ShopDocumentsValues>({
    resolver: i18nResolver(t, shopDocumentsSchema),
    defaultValues: {
      legalName: '',
      neq: '',
      registrationProof: null,
      gstNumber: '',
      qstNumber: '',
      mapaqNumber: '',
      mapaqExpiry: '',
      mapaqPermit: null,
      contactName: '',
      contactPhone: '',
      idDocument: null,
    },
  });
  const payoutForm = useForm<ShopPayoutInput, unknown, ShopPayoutValues>({
    resolver: i18nResolver(t, shopPayoutSchema),
    defaultValues: { payoutMethod: 'stripe', bankDocument: null },
  });

  const chosenType = identityForm.watch('vendorType');
  const payoutMethod = payoutForm.watch('payoutMethod');

  async function finish(payout: ShopPayoutValues) {
    if (!identity || !address || !documents) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({ identity, address, documents, payout });
    } catch (error) {
      // The API's messages are written for the merchant — a document that did
      // not upload says so — so they are shown as sent.
      const message = error instanceof Error && error.message ? error.message : null;
      setFormError(message ?? t('business.shopForm.sendFailed'));
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
                animate={{ backgroundColor: index <= step ? colors.primary : colors.border }}
                transition={{ type: 'timing', duration: 220 }}
              />
            ))}
          </View>
          <Text variant="label" tone="muted" className="text-[10px]">
            Étape {step + 1} — {t(`business.shopFormSteps.${STEP_KEYS[step]}`)}
          </Text>
        </View>

        {step === 0 ? (
          <View className="gap-5">
            <Controller
              control={identityForm.control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.name')}
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
                {t('business.shopForm.category')}
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
                            onPress={() => onChange(key)}
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
                  label={chosenType === 'restaurant' ? t('business.shopFormSteps.cuisine') : t('business.shopForm.specialty')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={identityForm.formState.errors.specialtyFr?.message}
                  required
                  helperText={
                    chosenType === 'restaurant'
                      ? t('business.specialtyPlaceholderRestaurant')
                      : t('business.specialtyPlaceholderGrocery')
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
                      {t('business.shopForm.halal')}
                    </Text>
                    <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
                      {t('business.shopForm.halalHint')}
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
                  label={t('business.shopForm.address')}
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
              render={({ field: { onChange, value } }) => (
                <CitySelect
                  value={value}
                  onChange={onChange}
                  error={addressForm.formState.errors.city?.message}
                  helperText={t('business.shopForm.cityHint')}
                />
              )}
            />
            <Controller
              control={addressForm.control}
              name="postalCode"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.postalCode')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  error={addressForm.formState.errors.postalCode?.message}
                  required
                  helperText={t('business.shopForm.postalHint')}
                />
              )}
            />
            <Controller
              control={addressForm.control}
              name="deliveryEtaMin"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.eta')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  error={addressForm.formState.errors.deliveryEtaMin?.message}
                  required
                />
              )}
            />
            <DeliveryGrid />
          </View>
        ) : null}

        {step === 2 ? (
          <View className="gap-4">
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('business.shopForm.reviewNote')}
            </Text>

            <Text variant="label" tone="muted">
              {t('business.shopForm.sectionCompany')}
            </Text>
            <Controller
              control={documentsForm.control}
              name="legalName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.legalName')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={documentsForm.formState.errors.legalName?.message}
                  required
                  helperText={t('business.shopForm.legalNameHint')}
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="neq"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.neq')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  error={documentsForm.formState.errors.neq?.message}
                  helperText={t('business.shopForm.neqHint')}
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="registrationProof"
              render={({ field: { onChange, value } }) => (
                <DocumentField
                  label={t('business.shopForm.registrationProof')}
                  helperText={t('business.shopForm.registrationProofHint')}
                  value={value}
                  onChange={onChange}
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="gstNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.gst')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  error={documentsForm.formState.errors.gstNumber?.message}
                  required
                  helperText={t('business.shopForm.gstHint')}
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="qstNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.qst')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  error={documentsForm.formState.errors.qstNumber?.message}
                  required
                  helperText={t('business.shopForm.qstHint')}
                />
              )}
            />

            <Text variant="label" tone="muted" className="mt-2">
              {t('business.shopForm.sectionMapaq')}
            </Text>
            <Controller
              control={documentsForm.control}
              name="mapaqNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.mapaq')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="characters"
                  error={documentsForm.formState.errors.mapaqNumber?.message}
                  required
                  helperText={
                    chosenType === 'restaurant'
                      ? t('business.shopForm.mapaqHintRestaurant')
                      : t('business.shopForm.mapaqHint')
                  }
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="mapaqExpiry"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.mapaqExpiry')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="numbers-and-punctuation"
                  error={documentsForm.formState.errors.mapaqExpiry?.message}
                  required
                  helperText={t('business.shopForm.mapaqExpiryHint')}
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="mapaqPermit"
              render={({ field: { onChange, value } }) => (
                <DocumentField
                  label={t('business.shopForm.mapaqPermit')}
                  value={value}
                  onChange={onChange}
                  error={documentsForm.formState.errors.mapaqPermit?.message}
                  required
                />
              )}
            />

            <Text variant="label" tone="muted" className="mt-2">
              {t('business.shopForm.sectionOfficer')}
            </Text>
            <Controller
              control={documentsForm.control}
              name="contactName"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('business.shopForm.contact')}
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
                  label={t('business.shopForm.contactPhone')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  error={documentsForm.formState.errors.contactPhone?.message}
                  required
                />
              )}
            />
            <Controller
              control={documentsForm.control}
              name="idDocument"
              render={({ field: { onChange, value } }) => (
                <DocumentField
                  label={t('business.shopForm.idDocument')}
                  helperText={t('business.shopForm.idDocumentHint')}
                  value={value}
                  onChange={onChange}
                  error={documentsForm.formState.errors.idDocument?.message}
                  required
                />
              )}
            />
          </View>
        ) : null}

        {step === 3 ? (
          <View className="gap-4">
            <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
              {t('business.shopForm.payoutNote')}
            </Text>
            <Controller
              control={payoutForm.control}
              name="payoutMethod"
              render={({ field: { onChange, value } }) => (
                <View className="gap-2.5">
                  {(
                    [
                      { key: 'stripe', icon: CreditCard },
                      { key: 'bank_document', icon: Landmark },
                    ] as const
                  ).map(({ key, icon: Icon }) => {
                    const selected = value === key;
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => onChange(key)}
                        className={`rounded-2xl border-[1.5px] p-4 flex-row gap-3 ${
                          selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
                        }`}
                      >
                        <Icon size={20} color={selected ? colors.primary : colors.mutedForeground} strokeWidth={2} />
                        <View className="flex-1 gap-1">
                          <Text variant="caption" weight="bold">
                            {t(`business.shopForm.payout.${key}.title`)}
                          </Text>
                          <Text variant="caption" tone="muted" className="text-[12px] leading-[18px]">
                            {t(`business.shopForm.payout.${key}.body`)}
                          </Text>
                        </View>
                        {selected ? <Check size={16} color={colors.primary} strokeWidth={3} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            />
            {payoutMethod === 'bank_document' ? (
              <Controller
                control={payoutForm.control}
                name="bankDocument"
                render={({ field: { onChange, value } }) => (
                  <DocumentField
                    label={t('business.shopForm.bankDocument')}
                    helperText={t('business.shopForm.bankDocumentHint')}
                    value={value}
                    onChange={onChange}
                    error={payoutForm.formState.errors.bankDocument?.message}
                    required
                  />
                )}
              />
            ) : null}
          </View>
        ) : null}

        {formError ? (
          <Text variant="caption" tone="destructive">
            {formError}
          </Text>
        ) : null}

        <View className="gap-2">
          <Button
            label={step === LAST_STEP ? t('business.shopFormSteps.submit') : t('common.continue')}
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
              } else if (step === 2) {
                documentsForm.handleSubmit((values) => {
                  setDocuments(values);
                  setStep(3);
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
