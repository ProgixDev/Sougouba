'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Text } from '@/components/ui/Text';
import { Skeleton } from '@/components/data/Skeleton';
import { ProductEditor, useProductEditorData } from '@/components/merchant/ProductEditor';
import { getMyProduct, type Product } from '@/lib/api/merchantCatalog';

export default function MerchantEditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { shop, categories, failed } = useProductEditorData();
  // undefined while loading; null for a product that is not this shop's.
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    // Scoped on the server: another shop's product answers 404, like a missing one.
    getMyProduct(id).then(setProduct).catch(() => setLoadFailed(true));
  }, [id]);

  return (
    <div className="flex flex-col gap-2">
      <Breadcrumbs items={[{ label: 'Produits', href: '/merchant/products' }, { label: product?.name ?? 'Produit' }]} />
      <Text as="h1" variant="display" className="mb-4">
        {product?.name ?? 'Produit'}
      </Text>
      {failed || loadFailed ? (
        <Text variant="body" tone="destructive">
          Impossible de charger ce produit. Vérifiez votre connexion et rechargez la page.
        </Text>
      ) : product === null ? (
        <Text variant="body" tone="muted">
          Ce produit est introuvable. Il a peut-être été supprimé.
        </Text>
      ) : shop && categories && product ? (
        // Keyed so that opening another product starts from that product's values.
        <ProductEditor key={product.id} product={product} shop={shop} categories={categories} />
      ) : (
        <Skeleton className="h-96 rounded-card" />
      )}
    </div>
  );
}
