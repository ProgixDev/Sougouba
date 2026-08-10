import { defaultDeliveryAddress } from '../seed/addresses';
import { buildOrder, orders as seedOrders, type OrderSpec } from '../seed/orders';
import type { Address, ID, Order, OrderItem, OrderStatus } from '../types';
import { delay } from '../utils/delay';
import { generateId } from '../utils/ids';
import { createPersistedTable } from '../utils/persistedTable';
import { localMinutesAgo } from '../utils/time';

/**
 * Orders persist across restarts: placing one, killing the app and finding it
 * gone reads as a bug, and Phase 3's dashboard aggregates the same records.
 */
const table = createPersistedTable<Order>('sougouba-mock-orders', seedOrders);

/** Copies out, so callers can't mutate the table by holding a reference. */
function snapshot(order: Order): Order {
  return { ...order, items: [...order.items], statusHistory: [...order.statusHistory] };
}

export async function getOrdersByCustomer(customerId: ID): Promise<Order[]> {
  await table.ready;
  await delay();
  return table
    .rows()
    .filter((o) => o.customerId === customerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(snapshot);
}

export async function getOrdersByVendor(vendorId: ID): Promise<Order[]> {
  await table.ready;
  await delay();
  return table
    .rows()
    .filter((o) => o.vendorId === vendorId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(snapshot);
}

export async function getOrderById(id: ID): Promise<Order | undefined> {
  await table.ready;
  await delay(150, 300);
  const found = table.rows().find((o) => o.id === id);
  return found ? snapshot(found) : undefined;
}

export async function createOrder(input: {
  customerId: ID;
  customerName?: string;
  vendorId: ID;
  items: OrderItem[];
  deliveryFeeCad: number;
  deliveryAddress: Address;
  createdAt: string;
}): Promise<Order> {
  await table.ready;
  await delay(500, 900);
  const subtotalCad = input.items.reduce((sum, item) => sum + item.unitPriceCad * item.qty, 0);
  const order: Order = {
    id: generateId('ord'),
    customerId: input.customerId,
    customerName: input.customerName,
    vendorId: input.vendorId,
    items: input.items,
    status: 'pending',
    subtotalCad,
    deliveryFeeCad: input.deliveryFeeCad,
    totalCad: subtotalCad + input.deliveryFeeCad,
    deliveryAddress: input.deliveryAddress,
    createdAt: input.createdAt,
    statusHistory: [{ status: 'pending', at: input.createdAt }],
  };
  await table.add(order);
  return snapshot(order);
}

export async function updateOrderStatus(id: ID, status: OrderStatus, at: string): Promise<Order | undefined> {
  await table.ready;
  await delay();
  const order = table.rows().find((o) => o.id === id);
  if (!order) return undefined;
  order.status = status;
  order.statusHistory.push({ status, at });
  await table.save(order.id);
  return snapshot(order);
}

/**
 * How far back each demo order sits, and where it has got to.
 *
 * Offsets are relative to the moment the account first opens the app, not fixed
 * dates: a prototype demoed weeks from now would otherwise show a "live"
 * delivery timestamped last month. Three closed orders give Commandes a history
 * to show; the two still moving give the tracking timeline something to track.
 */
const DEMO_ORDERS: {
  minutesAgo: number;
  vendorId: ID;
  lines: [productId: string, qty: number][];
  status: OrderStatus;
}[] = [
  { minutesAgo: 60 * 24 * 14, vendorId: 'vnd_saveurs_dakar', lines: [['prd_thieboudienne', 1], ['prd_jus_bissap', 2]], status: 'delivered' },
  { minutesAgo: 60 * 24 * 9, vendorId: 'vnd_boulangerie_tanit', lines: [['prd_msemen', 2], ['prd_cafe_turc', 1]], status: 'delivered' },
  { minutesAgo: 60 * 24 * 4, vendorId: 'vnd_douceurs_maghreb', lines: [['prd_cornes_gazelle', 1], ['prd_lben', 2]], status: 'delivered' },
  { minutesAgo: 55, vendorId: 'vnd_marche_bamako', lines: [['prd_mangue_kent', 3], ['prd_banane_plantain', 2], ['prd_gombo_frais', 1]], status: 'out_for_delivery' },
  { minutesAgo: 14, vendorId: 'vnd_epicerie_atlas', lines: [['prd_couscous_moyen', 1], ['prd_ras_el_hanout', 1], ['prd_harissa_artisanale', 2]], status: 'preparing' },
];

/**
 * Give an account without any order history a plausible one.
 *
 * The seed only knows four hard-coded customers, so anyone signing up in the app
 * lands on an empty Commandes tab and an empty tracking flow — the prototype
 * looks unfinished at exactly the screens it is meant to show off. This runs
 * once per account and is idempotent by construction: it does nothing when the
 * customer already has orders, and after the first call they always do.
 *
 * Returns the orders it created, or an empty array when it did nothing.
 */
export async function ensureDemoOrders(customerId: ID, customerName: string, address?: Address): Promise<Order[]> {
  await table.ready;
  if (table.rows().some((o) => o.customerId === customerId)) return [];

  const now = Date.now();
  const created = DEMO_ORDERS.map((demo, index) => {
    const spec: OrderSpec = {
      id: `ord_demo_${customerId}_${index}`,
      customerId,
      customerName,
      vendorId: demo.vendorId,
      address: address ?? defaultDeliveryAddress,
      lines: demo.lines,
      status: demo.status,
      createdAt: localMinutesAgo(demo.minutesAgo, now),
    };
    return buildOrder(spec);
  });

  for (const order of created) {
    await table.add(order);
  }
  return created;
}

export interface VendorStats {
  revenueCad: number;
  orderCount: number;
  avgBasketCad: number;
  topProductIds: ID[];
}

/** Aggregated from the same order records the Orders tabs read, so Dashboard numbers stay honest. */
export async function getVendorStats(vendorId: ID): Promise<VendorStats> {
  await table.ready;
  await delay();
  const vendorOrders = table.rows().filter((o) => o.vendorId === vendorId && o.status !== 'cancelled');
  const revenueCad = vendorOrders.reduce((sum, o) => sum + o.totalCad, 0);
  const orderCount = vendorOrders.length;
  const avgBasketCad = orderCount > 0 ? revenueCad / orderCount : 0;

  const qtyByProduct = new Map<ID, number>();
  for (const order of vendorOrders) {
    for (const item of order.items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.qty);
    }
  }
  const topProductIds = [...qtyByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId]) => productId);

  return { revenueCad, orderCount, avgBasketCad, topProductIds };
}
