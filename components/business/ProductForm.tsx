import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { Button, Chip, Input, Text } from '@/components/ui';
import { categoriesApi } from '@/data/api';
import type { Category, Product } from '@/data/types';
import { useColorScheme } from '@/hooks/useColorScheme';
import {
  parseTags,
  productSchema,
  type ProductFormInput,
  type ProductFormValues,
} from '@/lib/validation/product';
import { darkColors, lightColors } from '@/theme/colors';

export interface ProductFormProps {
  /** Omit to create. */
  product?: Product;
  submitLabel: string;
  onSubmit: (values: ProductFormValues, tags: string[]) => Promise<void>;
  onDelete?: () => void;
}

/**
 * Shared create/edit form.
 *
 * Every numeric field is a string here and coerced by the schema — RN text
 * inputs have no number type, and holding them as numbers means fighting
 * `NaN` on every keystroke while the field is mid-edit.
 */
export function ProductForm({ product, submitLabel, onSubmit, onDelete }: ProductFormProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  const [categories, setCategories] = useState<Category[]>([]);
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
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? '',
      description: product?.description ?? '',
      categoryId: product?.categoryId ?? '',
      priceCad: product ? String(product.priceCad) : '',
      compareAtPriceCad: product?.compareAtPriceCad ? String(product.compareAtPriceCad) : '',
      stockQty: product ? String(product.stockQty) : '',
      isAvailable: product?.isAvailable ?? true,
      tags: product?.tags.join(', ') ?? '',
      calories: product ? String(product.nutrition.calories) : '',
      proteinG: product ? String(product.nutrition.proteinG) : '',
      fatG: product ? String(product.nutrition.fatG) : '',
      weightG: product ? String(product.nutrition.weightG) : '',
    },
  });

  async function submit(values: ProductFormValues) {
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(values, parseTags(values.tags));
    } catch {
      setFormError('Enregistrement impossible. Veuillez réessayer.');
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
        <View className="gap-4">
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Nom du produit"
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
                label="Description"
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
          <Text variant="label" tone="muted">
            Catégorie
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
                      label={category.shortNameFr}
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
            Prix et stock
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Controller
                control={control}
                name="priceCad"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Prix ($)"
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
                    label="Prix barré ($)"
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
                label="Quantité en stock"
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
                    En vente
                  </Text>
                  <Text variant="caption" tone="muted" className="text-[12px]">
                    Masqué du catalogue client si désactivé
                  </Text>
                </View>
                <Switch
                  value={value}
                  onValueChange={onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  accessibilityLabel="Produit en vente"
                />
              </View>
            )}
          />
        </View>

        <View className="gap-4">
          <Text variant="label" tone="muted">
            Valeurs nutritionnelles
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Controller
                control={control}
                name="calories"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Calories"
                    keyboardType="number-pad"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.calories?.message}
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
                    label="Protéines (g)"
                    keyboardType="number-pad"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.proteinG?.message}
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
                    label="Lipides (g)"
                    keyboardType="number-pad"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.fatG?.message}
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
                    label="Poids (g)"
                    keyboardType="number-pad"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.weightG?.message}
                  />
                )}
              />
            </View>
          </View>
        </View>

        <Controller
          control={control}
          name="tags"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Étiquettes"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
              helperText="Séparées par des virgules — ex. bio, frais, halal"
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
              label="Supprimer ce produit"
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
