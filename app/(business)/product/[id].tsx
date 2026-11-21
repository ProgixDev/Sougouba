import { router, useLocalSearchParams } from 'expo-router';
import { PackageX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductForm } from '@/components/business';
import { useT } from '@/lib/i18n/useT';
import { BackHeader, EmptyState, Skeleton, Text } from '@/components/ui';
import { productsApi } from '@/data/api';
import type { Product } from '@/data/types';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { routes } from '@/lib/routes';

export default function EditProductScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vendor, missing } = useOwnerVendor();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    productsApi
      .getMyProduct(id)
      .then((found) => {
        if (active) setProduct(found ?? null);
      })
      // A network failure lands on "not found" rather than an unhandled rejection.
      .catch(() => {
        if (active) setProduct(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  function confirmDelete() {
    if (!product) return;
    Alert.alert(
      t('business.queue.deleteProductTitle'),
      t('business.confirmations.deleteProduct', { name: product.name }),
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await productsApi.deleteProduct(product.id);
            router.replace(routes.businessCatalog);
          },
        },
      ]
    );
  }

  if (loading || (!vendor && !missing)) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader title="Modifier" />
        <View className="px-5 gap-3">
          <Skeleton height={58} radius={16} />
          <Skeleton height={58} radius={16} />
          <Skeleton height={120} radius={16} />
        </View>
      </SafeAreaView>
    );
  }

  if (!product || !vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader />
        <EmptyState
          icon={PackageX}
          title="Produit introuvable"
          description={t('business.productDetail.notFoundBody')}
          actionLabel={t('business.productDetail.backToCatalog')}
          onAction={() => router.replace(routes.businessCatalog)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title={t('business.productDetail.edit')} />
      {/* Hidden by the back office: the merchant can still edit it, but no
          edit brings it back — only the Sougouba team can. */}
      {product.hiddenByAdmin ? (
        <View className="mx-5 mb-2 rounded-2xl bg-destructive/10 px-4 py-3 gap-1">
          <Text variant="caption" weight="semibold" tone="destructive">
            {t('business.productDetail.hiddenTitle')}
          </Text>
          <Text variant="caption" className="text-[13px] leading-[19px]">
            {product.hiddenByAdmin.reason
              ? t('business.productDetail.hiddenBodyReason', { reason: product.hiddenByAdmin.reason })
              : t('business.productDetail.hiddenBody')}
          </Text>
        </View>
      ) : null}
      <ProductForm
        vendor={vendor}
        product={product}
        submitLabel="Enregistrer"
        onDelete={confirmDelete}
        onSubmit={async (values, tags, imageUrl) => {
          await productsApi.updateProduct(product.id, {
            imageUrl,
            categoryId: values.categoryId,
            sectionId: values.sectionId,
            name: values.name,
            description: values.description,
            priceCad: values.priceCad,
            // Explicitly undefined when cleared, so removing a strike-through
            // price actually removes it instead of leaving the old value.
            compareAtPriceCad: values.compareAtPriceCad,
            // `hasNutrition` gates the four fields, and the schema guarantees
            // they are all present once it is set — so this is either the whole
            // block or none of it, never a partial one.
            ...(values.hasNutrition
              ? {
                  nutrition: {
                    calories: values.calories!,
                    proteinG: values.proteinG!,
                    fatG: values.fatG!,
                    weightG: values.weightG!,
                  },
                }
              : {}),
            stockQty: values.stockQty,
            isAvailable: values.isAvailable,
            tags,
          });
          router.replace(routes.businessCatalog);
        }}
      />
    </SafeAreaView>
  );
}
