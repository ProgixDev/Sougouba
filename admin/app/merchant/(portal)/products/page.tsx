'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EyeOff, ImageOff, Plus, Search, ShoppingBasket } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/insights/Insights';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/data/DataTable';
import { useToast } from '@/components/Toast';
import { Switch } from '@/components/merchant/fields';
import { getMyShop, listMyProducts, mediaUrl, updateProduct, type Product, type Shop } from '@/lib/api/merchantCatalog';
import { failureMessage } from '@/lib/merchantForm';
import { useDebounced, usePagedList } from '@/lib/usePagedList';
import { formatCad } from '@/lib/format';
import { t, useLocale } from '@/lib/i18n';

/**
 * The shop's catalogue, on the web: every product, searchable, by shelf. A
 * product is put on or taken off sale straight from the list; everything else
 * opens the editor.
 */
export default function MerchantProductsPage() {
  useLocale();
  const router = useRouter();
  const toast = useToast();
  const [shop, setShop] = useState<Shop | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  // Switches flipped since the page was fetched, so the row answers at once.
  const [available, setAvailable] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Only for the shelves' names; the list itself does not wait for it.
    getMyShop().then(setShop).catch(() => undefined);
  }, []);

  const list = usePagedList<Product>(
    ({ offset, limit }) => listMyProducts({ search: debouncedSearch, sectionId: sectionId || undefined }, { offset, limit }),
    `${sectionId}|${debouncedSearch}`
  );

  const sectionName = (id: string) => shop?.sections.find((section) => section.id === id)?.nameFr ?? '—';
  const shelves = shop?.vendorType === 'restaurant' ? t('portal.products.list.allSections') : t('portal.products.list.allShelves');

  async function setOnSale(product: Product, next: boolean) {
    setAvailable((current) => ({ ...current, [product.id]: next }));
    try {
      await updateProduct(product.id, { isAvailable: next });
    } catch (error) {
      setAvailable((current) => ({ ...current, [product.id]: !next }));
      toast('error', failureMessage(error, t('portal.products.list.updateFailed')));
    }
  }

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: t('portal.products.list.columns.product'),
      render: (p) => {
        const src = mediaUrl(p.imageUrl);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
              {src ? (
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <ImageOff size={16} strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0">
              <Text variant="body" className="truncate font-semibold">
                {p.name}
              </Text>
              {p.hiddenByAdmin && (
                <span className="mt-0.5 inline-flex items-center gap-1 font-sans text-[0.75rem] font-medium text-destructive">
                  <EyeOff size={12} /> {t('portal.products.list.hiddenByAdmin')}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    { key: 'section', header: shop?.vendorType === 'restaurant' ? t('portal.products.list.columns.section') : t('portal.products.list.columns.shelf'), render: (p) => <Text variant="body" tone="muted">{sectionName(p.sectionId)}</Text> },
    {
      key: 'price',
      header: t('portal.products.list.columns.price'),
      className: 'text-right',
      render: (p) => (
        <div className="text-right">
          <Text variant="body" className="tabular font-semibold">
            {formatCad(p.priceCad)}
          </Text>
          {p.compareAtPriceCad !== undefined && (
            <Text variant="caption" tone="muted" className="tabular line-through">
              {formatCad(p.compareAtPriceCad)}
            </Text>
          )}
        </div>
      ),
    },
    {
      key: 'stock',
      header: t('portal.products.list.columns.stock'),
      className: 'text-right',
      render: (p) =>
        p.stockQty === 0 ? (
          <Badge tone="destructive" size="sm">
            {t('portal.products.list.outOfStock')}
          </Badge>
        ) : (
          <Text variant="body" className="tabular text-right">
            {p.stockQty}
          </Text>
        ),
    },
    {
      key: 'available',
      header: t('portal.products.list.columns.onSale'),
      render: (p) => (
        // The row opens the editor; the switch must not.
        <span onClick={(e) => e.stopPropagation()} className="inline-flex">
          <Switch
            checked={available[p.id] ?? p.isAvailable}
            onChange={(next) => void setOnSale(p, next)}
            label={t('portal.products.list.onSaleLabel', { name: p.name })}
          />
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={ShoppingBasket}
        title={t('nav.merchant.products')}
        description={t('portal.products.list.description')}
        actions={
          <Link
            href="/merchant/products/new"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-sans text-[0.875rem] font-semibold text-primary-foreground shadow-cta-primary transition-[filter] hover:brightness-[0.96]"
          >
            <Plus size={17} /> {t('portal.products.list.newProduct')}
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          aria-label={t('portal.products.list.filterLabel')}
          className="cursor-pointer rounded-full border border-border bg-card px-4 py-2 font-sans text-[0.8125rem] font-medium text-foreground outline-none"
        >
          <option value="">{shelves}</option>
          {shop?.sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.nameFr}
            </option>
          ))}
        </select>
        <div className="flex w-full items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground sm:w-auto">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('portal.products.list.searchPlaceholder')}
            className="w-full min-w-0 bg-transparent font-sans text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground sm:w-56"
          />
        </div>
      </div>

      {list.error && (
        <Text variant="body" tone="destructive">
          {t('portal.products.list.loadFailed')}
        </Text>
      )}

      <Card elevated>
        <DataTable
          columns={columns}
          rows={list.rows ?? []}
          keyField={(p) => p.id}
          onRowClick={(p) => router.push(`/merchant/products/${p.id}`)}
          loading={list.rows === null && !list.error}
          emptyIcon={ShoppingBasket}
          emptyTitle={debouncedSearch || sectionId ? t('portal.products.list.empty.noMatchTitle') : t('portal.products.list.empty.noneTitle')}
          emptyDescription={debouncedSearch || sectionId ? t('portal.products.list.empty.noMatchDescription') : t('portal.products.list.empty.noneDescription')}
          server={{
            page: list.page,
            pageSize: list.pageSize,
            total: list.total,
            onPage: list.setPage,
            onPageSize: list.setPageSize,
            sort: list.sort,
            onSort: list.setSort,
          }}
        />
      </Card>
    </div>
  );
}
