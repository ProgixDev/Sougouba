'use client';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { Text } from '@/components/ui/Text';
import { Skeleton } from '@/components/data/Skeleton';
import { ProductEditor, useProductEditorData } from '@/components/merchant/ProductEditor';
import { t, useLocale } from '@/lib/i18n';

export default function MerchantNewProductPage() {
  useLocale();
  const { shop, categories, failed } = useProductEditorData();

  return (
    <div className="flex flex-col gap-2">
      <Breadcrumbs items={[{ label: t('nav.merchant.products'), href: '/merchant/products' }, { label: t('portal.products.editor.newTitle') }]} />
      <Text as="h1" variant="display" className="mb-4">
        {t('portal.products.editor.newTitle')}
      </Text>
      {failed ? (
        <Text variant="body" tone="destructive">
          {t('portal.shop.loadFailed')}
        </Text>
      ) : shop && categories ? (
        <ProductEditor shop={shop} categories={categories} />
      ) : (
        <Skeleton className="h-96 rounded-card" />
      )}
    </div>
  );
}
