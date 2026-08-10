import { router } from 'expo-router';
import { Store } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductForm } from '@/components/business';
import { BackHeader, EmptyState } from '@/components/ui';
import { productsApi } from '@/data/api';
import { useOwnerVendor } from '@/hooks/useOwnerVendor';
import { routes } from '@/lib/routes';

export default function NewProductScreen() {
  const { vendor, missing } = useOwnerVendor();

  if (missing) {
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
        submitLabel="Ajouter au catalogue"
        onSubmit={async (values, tags) => {
          if (!vendor) return;
          await productsApi.createProduct({
            vendorId: vendor.id,
            categoryId: values.categoryId,
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
