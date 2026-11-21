import { MotiView } from 'moti';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { Button, Chip, Input, Text } from '@/components/ui';
import { categoriesApi, productsApi } from '@/data/api';
import { productImageType } from '@/data/api/products';
import type { Category, Product, Vendor } from '@/data/types';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  parseTags,
  productSchema,
  type ProductFormInput,
  type ProductFormValues,
} from '@/lib/validation/product';
import { darkColors, lightColors } from '@/theme/colors';
import { i18nResolver } from '@/lib/validation/resolver';
import { useLocalized } from '@/lib/localized';
import { useT } from '@/lib/i18n/useT';

import { ProductPhotoField, type ProductPhotoValue } from './ProductPhotoField';

export interface ProductFormProps {
  /** The shop being edited — its `sections` are the shelves a product can go on. */
  vendor: Vendor;
  /** Omit to create. */
  product?: Product;
  submitLabel: string;
  /** `imageUrl` is the Storage path to save — already uploaded if a new photo was picked, `''` for none. */
  onSubmit: (values: ProductFormValues, tags: string[], imageUrl: string) => Promise<void>;
  onDelete?: () => void;
}

/**
 * Shared create/edit form.
 *
 * Every numeric field is a string here and coerced by the schema — RN text
 * inputs have no number type, and holding them as numbers means fighting
 * `NaN` on every keystroke while the field is mid-edit.
 */
export function ProductForm({ vendor, product, submitLabel, onSubmit, onDelete }: ProductFormProps) {
  const L = useLocalized();
  const t = useT();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const [categories, setCategories] = useState<Category[]>([]);
  // Outside react-hook-form: a picked photo is a file, not a field the schema checks.
  const [photo, setPhoto] = useState<ProductPhotoValue>(product?.imageUrl ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    categoriesApi.getCategories().then(setCategories);
  }, []);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: i18nResolver(t, productSchema),
    defaultValues: {
      name: product?.name ?? '',
      description: product?.description ?? '',
      categoryId: product?.categoryId ?? '',
      sectionId: product?.sectionId ?? '',
      priceCad: product ? String(product.priceCad) : '',
      compareAtPriceCad: product?.compareAtPriceCad ? String(product.compareAtPriceCad) : '',
      stockQty: product ? String(product.stockQty) : '',
      isAvailable: product?.isAvailable ?? true,
      tags: product?.tags.join(', ') ?? '',
      // Off for a new product, and on for one that already declares values —
      // opening the editor with the section collapsed over data the merchant
      // entered would read as having lost it.
      hasNutrition: Boolean(product?.nutrition),
      calories: product?.nutrition ? String(product.nutrition.calories) : '',
      proteinG: product?.nutrition ? String(product.nutrition.proteinG) : '',
      fatG: product?.nutrition ? String(product.nutrition.fatG) : '',
      weightG: product?.nutrition ? String(product.nutrition.weightG) : '',
    },
  });

  const hasNutrition = useWatch({ control, name: 'hasNutrition' });

  async function submit(values: ProductFormValues) {
    setFormError(null);
    setSubmitting(true);
    let imageUrl: string;
    try {
      // Uploaded only now, so backing out of the form leaves nothing in Storage.
      // A failed save after this leaves the photo behind; keeping the path means
      // a retry does not upload it a second time.
      imageUrl =
        typeof photo === 'string' ? photo : await productsApi.uploadProductImage(photo, productImageType(photo)!);
      setPhoto(imageUrl);
    } catch {
      setFormError(t('business.productForm.photoUploadFailed'));
      setSubmitting(false);
      return;
    }
    try {
      await onSubmit(values, parseTags(values.tags), imageUrl);
    } catch {
      setFormError(t('business.saveFailed'));
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
      >
        <ProductPhotoField value={photo} onChange={setPhoto} disabled={submitting} />

        <View className="gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('business.productForm.name')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
                required
              />
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('business.productForm.description')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.description?.message}
                required
              />
            )}
          />
        </View>

        <View className="gap-3">
          {/* Where the product sits on this shop's own page. Asked before the
              platform category because it is the one the merchant thinks in:
              they are adding a dish to a course, or a bag of rice to a shelf. */}
          <Text variant="label" tone="muted">
            {vendor.vendorType === 'restaurant' ? t('business.queue.menuSection') : 'Rayon'}
          </Text>
          <Controller
            control={control}
            name="sectionId"
            render={({ field: { onChange, value } }) => (
              <>
                <View className="flex-row flex-wrap gap-2">
                  {vendor.sections.map((section) => (
                    <Chip
                      key={section.id}
                      label={L(section.name)}
                      selected={value === section.id}
                      onPress={() => onChange(section.id)}
                    />
                  ))}
                </View>
                {errors.sectionId ? (
                  <Text variant="caption" tone="destructive">
                    {errors.sectionId.message}
                  </Text>
                ) : null}
              </>
            )}
          />
        </View>

        <View className="gap-3">
          <Text variant="label" tone="muted">
            {t('business.productForm.category')}
          </Text>
          <Controller
            control={control}
            name="categoryId"
            render={({ field: { onChange, value } }) => (
              <>
                <View className="flex-row flex-wrap gap-2">
                  {categories.map((category) => (
                    <Chip
                      key={category.id}
                      label={L(category.shortName)}
                      selected={value === category.id}
                      onPress={() => onChange(category.id)}
                    />
                  ))}
                </View>
                {errors.categoryId ? (
                  <Text variant="caption" tone="destructive">
                    {errors.categoryId.message}
                  </Text>
                ) : null}
              </>
            )}
          />
        </View>

        <View className="gap-4">
          <Text variant="label" tone="muted">
            {t('business.productForm.priceAndStock')}
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Controller
                control={control}
                name="priceCad"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('business.productForm.price')}
                    keyboardType="decimal-pad"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.priceCad?.message}
                    required
                  />
                )}
              />
            </View>
            <View className="flex-1">
              <Controller
                control={control}
                name="compareAtPriceCad"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('business.productForm.compareAt')}
                    keyboardType="decimal-pad"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.compareAtPriceCad?.message}
                    helperText={errors.compareAtPriceCad ? undefined : 'Optionnel'}
                  />
                )}
              />
            </View>
          </View>

          <Controller
            control={control}
            name="stockQty"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('business.productForm.stock')}
                keyboardType="number-pad"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.stockQty?.message}
                required
              />
            )}
          />

          <Controller
            control={control}
            name="isAvailable"
            render={({ field: { onChange, value } }) => (
              <View className="flex-row items-center justify-between rounded-2xl bg-card px-4 py-3">
                <View className="flex-1 pr-3">
                  <Text variant="caption" weight="semibold">
                    {t('business.productForm.onSale')}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[12px]">
                    {t('business.productForm.onSaleHint')}
                  </Text>
                </View>
                <Switch
                  value={value}
                  onValueChange={onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  accessibilityLabel={t('common.a11y.productOnSale')}
                />
              </View>
            )}
          />
        </View>

        {/* Opt-in (client, août 2026). Four required numbers stood between a
            merchant and saving a sack of rice; most of the catalogue has no
            label to copy them off. Collapsed rather than merely optional —
            fields that are visible read as expected. */}
        <View className="gap-4">
          <Controller
            control={control}
            name="hasNutrition"
            render={({ field: { onChange, value } }) => (
              <View className="flex-row items-center justify-between rounded-2xl bg-card px-4 py-3">
                <View className="flex-1 pr-3">
                  <Text variant="caption" weight="semibold">
                    {t('business.productForm.addNutrition')}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[12px]">
                    {t('business.productForm.nutritionHint')}
                  </Text>
                </View>
                <Switch
                  value={value}
                  onValueChange={onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  accessibilityLabel={t('business.productForm.addNutrition')}
                />
              </View>
            )}
          />

          {hasNutrition ? (
            <MotiView
              from={{ opacity: 0, translateY: -8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 200 }}
              className="gap-4"
            >
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="calories"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label={t('business.productForm.calories')}
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.calories?.message}
                        required
                      />
                    )}
                  />
                </View>
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="proteinG"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label={t('business.productForm.protein')}
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.proteinG?.message}
                        required
                      />
                    )}
                  />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="fatG"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label={t('business.productForm.fat')}
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.fatG?.message}
                        required
                      />
                    )}
                  />
                </View>
                <View className="flex-1">
                  <Controller
                    control={control}
                    name="weightG"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <Input
                        label={t('business.productForm.weight')}
                        keyboardType="number-pad"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        error={errors.weightG?.message}
                        required
                      />
                    )}
                  />
                </View>
              </View>
            </MotiView>
          ) : null}
        </View>

        <Controller
          control={control}
          name="tags"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('business.productForm.tags')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
              helperText={t('business.productForm.tagsHint')}
            />
          )}
        />

        {formError ? (
          <Text variant="caption" tone="destructive">
            {formError}
          </Text>
        ) : null}

        <View className="gap-2">
          <Button
            label={submitLabel}
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={handleSubmit(submit)}
          />
          {onDelete ? (
            <Button
              label={t('business.productForm.remove')}
              variant="ghost"
              size="md"
              fullWidth
              disabled={submitting}
              onPress={onDelete}
            />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
