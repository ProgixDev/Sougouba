import { useEffect, useMemo, useState } from 'react';

import { productsApi, vendorsApi } from '@/data/api';
import { deliveryFeeBetween } from '@/data/deliveryPricing';
import { orderTotal, roundCad, taxesOn } from '@/data/taxes';
import type { CartItem, Product, Vendor } from '@/data/types';
import { distanceKm } from '@/data/utils/geo';
import { deliveryAddressFor } from '@/lib/deliveryAddress';
import { useCartStore } from '@/store/useCartStore';
import { useSessionStore } from '@/store/useSessionStore';

export interface CartLine {
  item: CartItem;
  product: Product;
}

export interface CartDetails {
  lines: CartLine[];
  vendor: Vendor | null;
  subtotalCad: number;
  gstCad: number;
  qstCad: number;
  deliveryFeeCad: number;
  /** Shop to shopper, straight-line. `undefined` while the vendor is loading. */
  deliveryDistanceKm?: number;
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
 * The delivery fee is no longer the shop's number: it comes from the Sougouba
 * grid (`data/deliveryPricing.ts`) applied to the distance between the shop and
 * where the order is going, so it is 0 until the vendor resolves. Totals are
 * derived from the *stored* unit price, not the current catalogue price, so a
 * price change mid-session can't silently alter what the shopper was quoted.
 *
 * Tax comes from `data/taxes.ts`, the same module the mock backend uses to price
 * the order it writes — so the figure quoted in the cart is the figure charged.
 */
export function useCartDetails(): CartDetails {
  const items = useCartStore((s) => s.items);
  const vendorId = useCartStore((s) => s.vendorId);
  const user = useSessionStore((s) => s.user);

  const [products, setProducts] = useState<Record<string, Product>>({});
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(items.length > 0);

  /**
   * Which products the cart holds, as a stable string.
   *
   * The effect below fetches exactly these ids, so it has to re-run when the
   * *set* changes — not when the count does. Swapping one product for another
   * leaves `items.length` untouched, and keying the effect on the length would
   * leave the new line with no product to join against, which `lines` then
   * silently drops. Sorted so reordering the cart is not a change.
   */
  const productKey = useMemo(
    () =>
      items
        .map((i) => i.productId)
        .sort()
        .join(','),
    [items]
  );

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
      // Only the lines in the cart. This used to call `getProducts()`, which
      // downloaded the entire catalogue to name three rows.
      productsApi.getProductsByIds(items.map((i) => i.productId)),
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
    // Keyed on `productKey`, not `items`: the set of products is what this
    // fetches, so a quantity bump re-renders without refetching.
  }, [productKey, vendorId]);

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
    () => roundCad(items.reduce((sum, i) => sum + i.unitPriceCad * i.qty, 0)),
    [items]
  );

  const taxes = useMemo(() => taxesOn(subtotalCad), [subtotalCad]);

  // Measured against the same address `checkout` will write onto the order, so
  // the figure quoted in the cart is the figure charged.
  const destination = useMemo(() => deliveryAddressFor(user), [user]);
  const deliveryDistanceKm = vendor ? distanceKm(vendor.address, destination) : undefined;
  const deliveryFeeCad =
    items.length > 0 && vendor ? deliveryFeeBetween(vendor.address, destination) : 0;

  return {
    lines,
    vendor,
    subtotalCad,
    ...taxes,
    deliveryFeeCad,
    ...(deliveryDistanceKm === undefined ? {} : { deliveryDistanceKm }),
    totalCad: orderTotal(subtotalCad, taxes, deliveryFeeCad),
    loading,
  };
}
