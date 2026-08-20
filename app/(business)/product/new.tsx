import { router } from 'expo-router';
import { Store } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductForm } from '@/components/business';
import { BackHeader, EmptyState, Skeleton } from '@/components/ui';
import { productsApi } from '@/data/api';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { routes } from '@/lib/routes';

export default function NewProductScreen() {
  const { vendor, missing } = useOwnerVendor();

  // The form is built from the shop's own sections, so it cannot be rendered
  // before the shop resolves.
  if (!vendor && !missing) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader title="Nouveau produit" />
        <View className="px-5 gap-3">
          <Skeleton height={58} radius={16} />
          <Skeleton height={58} radius={16} />
          <Skeleton height={120} radius={16} />
        </View>
      </SafeAreaView>
    );
  }

  if (missing || !vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <BackHeader />
        <EmptyState
          icon={Store}
          title="Aucune boutique associée"
          description="Impossible d’ajouter un produit sans boutique rattachée."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <BackHeader title="Nouveau produit" />
      <ProductForm
        vendor={vendor}
        submitLabel="Ajouter au catalogue"
        onSubmit={async (values, tags) => {
          await productsApi.createProduct({
            vendorId: vendor.id,
            categoryId: values.categoryId,
            sectionId: values.sectionId,
            name: values.name,
            description: values.description,
            priceCad: values.priceCad,
            compareAtPriceCad: values.compareAtPriceCad,
            // Photography is bundled per-id by scripts/fetch-product-images.mjs,
            // so a product created in-app has no image and falls back to the
            // branded placeholder.
            imageUrl: '',
            nutrition: {
              calories: values.calories,
              proteinG: values.proteinG,
              fatG: values.fatG,
              weightG: values.weightG,
            },
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
