'use client';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Text } from '@/components/ui/Text';
import { Skeleton } from '@/components/data/Skeleton';
import { ProductEditor, useProductEditorData } from '@/components/merchant/ProductEditor';

export default function MerchantNewProductPage() {
  const { shop, categories, failed } = useProductEditorData();

  return (
    <div className="flex flex-col gap-2">
      <Breadcrumbs items={[{ label: 'Produits', href: '/merchant/products' }, { label: 'Nouveau produit' }]} />
      <Text as="h1" variant="display" className="mb-4">
        Nouveau produit
      </Text>
      {failed ? (
        <Text variant="body" tone="destructive">
          Impossible de charger votre boutique. Vérifiez votre connexion et rechargez la page.
        </Text>
      ) : shop && categories ? (
        <ProductEditor shop={shop} categories={categories} />
      ) : (
        <Skeleton className="h-96 rounded-card" />
      )}
    </div>
  );
}
