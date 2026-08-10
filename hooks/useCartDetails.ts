import { useEffect, useMemo, useState } from 'react';

import { productsApi, vendorsApi } from '@/data/api';
import type { CartItem, Product, Vendor } from '@/data/types';
import { useCartStore } from '@/store/useCartStore';

export interface CartLine {
  item: CartItem;
  product: Product;
}

export interface CartDetails {
  lines: CartLine[];
  vendor: Vendor | null;
  subtotalCad: number;
  deliveryFeeCad: number;
  totalCad: number;
  loading: boolean;
}

/**
 * Joins the persisted cart against the catalogue.
 *
 * The store only keeps ids, quantities and unit prices — enough to survive a
 * restart without stale product copy, but not enough to render a row. Cart and
 * Checkout both need the same join plus the same totals, so it lives here rather
 * than being written twice and drifting.
 *
 * Delivery fee comes from the vendor, so it is 0 until that resolves; totals are
 * derived from the *stored* unit price, not the current catalogue price, so a
 * price change mid-session can't silently alter what the shopper was quoted.
 */
export function useCartDetails(): CartDetails {
  const items = useCartStore((s) => s.items);
  const vendorId = useCartStore((s) => s.vendorId);

  const [products, setProducts] = useState<Record<string, Product>>({});
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(items.length > 0);

  useEffect(() => {
    if (items.length === 0) {
      setProducts({});
      setVendor(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      productsApi.getProducts(),
      vendorId ? vendorsApi.getVendorById(vendorId) : Promise.resolve(undefined),
    ])
      .then(([all, v]) => {
        if (!active) return;
        setProducts(Object.fromEntries(all.map((p) => [p.id, p])));
        setVendor(v ?? null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Re-join when the set of products changes, not on every quantity tick.
  }, [items.length, vendorId]);

  const lines = useMemo(
    () =>
      items
        .map((item) => {
          const product = products[item.productId];
          return product ? { item, product } : null;
        })
        // A product deleted from the catalogue since the cart was saved simply drops out.
        .filter((line): line is CartLine => line !== null),
    [items, products]
  );

  const subtotalCad = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPriceCad * i.qty, 0),
    [items]
  );

  const deliveryFeeCad = items.length > 0 ? (vendor?.deliveryFeeCad ?? 0) : 0;

  return {
    lines,
    vendor,
    subtotalCad,
    deliveryFeeCad,
    totalCad: subtotalCad + deliveryFeeCad,
    loading,
  };
}
