import type { ID, Order } from '../types';
import { getSeed } from './seed';
import { delay, loadTable } from './storage';

/**
 * Order reads for the **merchant portal**, still backed by the localStorage
 * mock.
 *
 * This is the mock implementation that used to live in `orders.ts`, lifted here
 * unchanged when that file was rewritten to call the real API. The split is
 * deliberate rather than incidental: `/admin/orders` is guarded by `AdminGuard`,
 * so a merchant session holds no token that could reach it, and pointing the
 * portal at the admin endpoint would 403 on every screen.
 *
 * Wiring the merchant portal for real needs endpoints that do not exist yet —
 * a merchant-scoped `GET /merchant/orders` and `GET /merchant/orders/:id` that
 * resolve the shop from the caller's own session. That matters beyond
 * convenience: `app/merchant/(portal)/orders/[id]/page.tsx` currently enforces
 * tenancy **client-side**, by fetching any order and blanking it if
 * `vendorId` does not match. Against a real API that check has to move to the
 * server and 404, or one merchant can read another's orders by editing a URL.
 *
 * Until then this stays on the mock, where every "shop" is fictional and there
 * is nothing to leak.
 */

const TABLE_KEY = 'sougouba-admin-orders';

function table(): Order[] {
  return loadTable(TABLE_KEY, getSeed().orders);
}

export interface MerchantOrderFilters {
  vendorId?: ID;
}

export async function listMerchantOrders(filters: MerchantOrderFilters = {}): Promise<Order[]> {
  await delay();
  let rows = table();
  if (filters.vendorId) rows = rows.filter((o) => o.vendorId === filters.vendorId);
  return rows;
}

export async function getMerchantOrder(id: ID): Promise<Order | undefined> {
  await delay(150, 300);
  return table().find((o) => o.id === id);
}
