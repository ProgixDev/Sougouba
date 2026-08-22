import { router, useLocalSearchParams } from 'expo-router';
import { PackageX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductForm } from '@/components/business';
import { BackHeader, EmptyState, Skeleton } from '@/components/ui';
import { productsApi } from '@/data/api';
import type { Product } from '@/data/types';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { routes } from '@/lib/routes';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vendor, missing } = useOwnerVendor();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let active = true;
    productsApi
      .getProductById(id)
      .then((found) => {
        if (active) setProduct(found ?? null);
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
      'Supprimer ce produit ?',
      `« ${product.name} » disparaîtra du catalogue. Cette action est définitive.`,
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
          description="Ce produit a peut-être déjà été supprimé."
          actionLabel="Retour au catalogue"
          onAction={() => router.replace(routes.businessCatalog)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Modifier le produit" />
      <ProductForm
        vendor={vendor}
        product={product}
        submitLabel="Enregistrer"
        onDelete={confirmDelete}
        onSubmit={async (values, tags) => {
          await productsApi.updateProduct(product.id, {
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
