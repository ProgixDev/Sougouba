import { useEffect, useRef } from 'react';

import { ordersApi, productsApi } from '@/data/api';
import type { ID } from '@/data/types';
import { useCartStore } from '@/store/useCartStore';
import { useSessionStore } from '@/store/useSessionStore';

/** A basket from one shop — the cart enforces a single vendor, so these must agree. */
const DEMO_CART: { vendorId: ID; productIds: { id: ID; qty: number }[] } = {
  vendorId: 'vnd_teranga',
  productIds: [
    { id: 'prd_riz_parfume', qty: 1 },
    { id: 'prd_niebe', qty: 2 },
    { id: 'prd_huile_palme', qty: 1 },
  ],
};

/**
 * Fill an account's first session with something to look at.
 *
 * Only the four hard-coded seed customers have orders, so an account created in
 * the app opens on an empty Panier and an empty Commandes — every screen built
 * around them reads as unfinished rather than as a working prototype.
 *
 * Both halves hang off one condition: whether this customer has any orders yet.
 * That makes the whole thing idempotent without a separate "already seeded"
 * flag, and it means a shopper who deliberately empties their cart never finds
 * it refilled on the next launch, because by then the orders exist.
 */
export function useDemoSeed() {
  const user = useSessionStore((s) => s.user);
  const attempted = useRef<ID | null>(null);

  useEffect(() => {
    if (!user || user.role !== 'customer') return;
    if (attempted.current === user.id) return;
    attempted.current = user.id;

    let cancelled = false;

    (async () => {
      const created = await ordersApi.ensureDemoOrders(
        user.id,
        user.fullName,
        user.addresses.find((a) => a.isDefault) ?? user.addresses[0]
      );
      // Nothing created means this account already had history — leave the cart
      // exactly as the shopper left it.
      if (cancelled || created.length === 0) return;

      const cart = useCartStore.getState();
      if (cart.items.length > 0) return;

      const products = await productsApi.getProducts();
      if (cancelled) return;

      const byId = new Map(products.map((p) => [p.id, p]));
      for (const line of DEMO_CART.productIds) {
        const product = byId.get(line.id);
        if (!product) continue;
        useCartStore.getState().addItem({
          productId: product.id,
          vendorId: product.vendorId,
          unitPriceCad: product.priceCad,
          qty: line.qty,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}
