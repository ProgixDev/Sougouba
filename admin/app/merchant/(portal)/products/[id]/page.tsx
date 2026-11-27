'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Text } from '@/components/ui/Text';
import { Skeleton } from '@/components/data/Skeleton';
import { ProductEditor, useProductEditorData } from '@/components/merchant/ProductEditor';
import { getMyProduct, type Product } from '@/lib/api/merchantCatalog';
import { t } from '@/lib/i18n';

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
      <Breadcrumbs items={[{ label: t('nav.merchant.products'), href: '/merchant/products' }, { label: product?.name ?? t('portal.products.editor.fallbackTitle') }]} />
      <Text as="h1" variant="display" className="mb-4">
        {product?.name ?? t('portal.products.editor.fallbackTitle')}
      </Text>
      {failed || loadFailed ? (
        <Text variant="body" tone="destructive">
          {t('portal.products.editor.loadFailed')}
        </Text>
      ) : product === null ? (
        <Text variant="body" tone="muted">
          {t('portal.products.editor.notFound')}
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
