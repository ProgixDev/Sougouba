import { courierEarnings } from '../courierPay';
import { deliveryPin, legDurationMin } from '../delivery';
import { defaultDeliveryAddress } from '../seed/addresses';
import { buildOrder, orderAddresses, orders as seedOrders, type OrderSpec } from '../seed/orders';
import { products as seedProducts } from '../seed/products';
import { users as seedUsers } from '../seed/users';
import { vendors as seedVendors } from '../seed/vendors';
import { orderTotal, roundCad, taxesOn } from '../taxes';
import type {
  Address,
  Courier,
  CourierIssue,
  CourierIssueReason,
  DeliveryProof,
  DisputeReason,
  ID,
  LatLng,
  Order,
  OrderItem,
  OrderStatus,
  VehicleType,
} from '../types';
import { delay } from '../utils/delay';
import { generateId } from '../utils/ids';
import { distanceKm } from '../utils/geo';
import { createPersistedTable } from '../utils/persistedTable';
import { hashString, mulberry32 } from '../utils/random';
import { localIsoAt, localMinutesAgo } from '../utils/time';

/**
 * Orders persist across restarts: placing one, killing the app and finding it
 * gone reads as a bug, and Phase 3's dashboard aggregates the same records.
 */
// The key carries a version because `Order` gained TPS/TVQ: rows written before
// that change have no tax lines and a total that predates them, and a receipt
// whose figures do not add up is worse than one that is simply gone.
const table = createPersistedTable<Order>('sougouba-mock-orders-v2', seedOrders);

/** Copies out, so callers can't mutate the table by holding a reference. */
function snapshot(order: Order): Order {
  return {
    ...order,
    items: [...order.items],
    statusHistory: [...order.statusHistory],
    ...(order.dispute ? { dispute: { ...order.dispute } } : {}),
    ...(order.courierIssue ? { courierIssue: { ...order.courierIssue } } : {}),
    ...(order.delivery
      ? {
          delivery: {
            ...order.delivery,
            ...(order.delivery.proof ? { proof: { ...order.delivery.proof } } : {}),
          },
        }
      : {}),
  };
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
  const subtotalCad = roundCad(input.items.reduce((sum, item) => sum + item.unitPriceCad * item.qty, 0));
  // Recomputed here rather than accepted from the caller: the checkout quotes a
  // total, but what the order is worth is the backend's answer, not the screen's.
  const taxes = taxesOn(subtotalCad);
  const order: Order = {
    id: generateId('ord'),
    customerId: input.customerId,
    customerName: input.customerName,
    vendorId: input.vendorId,
    items: input.items,
    status: 'pending',
    subtotalCad,
    ...taxes,
    deliveryFeeCad: input.deliveryFeeCad,
    totalCad: orderTotal(subtotalCad, taxes, input.deliveryFeeCad),
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
 * Report a problem on a finished order (CDC addendum v1.1, §04).
 *
 * Writes onto the order rather than into a table of its own: a dispute has no
 * life independent of the order it is about, every screen that shows one already
 * holds the order, and the platform back-office that will trade in disputes
 * proper is a later sprint. When it arrives this is the record it reads.
 */
export async function openDispute(
  id: ID,
  input: { reason: DisputeReason; message: string; at: string }
): Promise<Order | undefined> {
  await table.ready;
  await delay(400, 700);
  const order = table.rows().find((o) => o.id === id);
  if (!order) return undefined;
  // Deliberately not an update: reopening would overwrite what the shopper
  // originally said, which is the one part of a dispute nobody should be able
  // to rewrite.
  if (order.dispute) return snapshot(order);
  order.dispute = {
    reason: input.reason,
    message: input.message,
    openedAt: input.at,
    status: 'open',
  };
  await table.save(order.id);
  return snapshot(order);
}

/** The merchant's answer. Settling the dispute is the back-office's call, not theirs. */
export async function replyToDispute(
  id: ID,
  input: { message: string; at: string }
): Promise<Order | undefined> {
  await table.ready;
  await delay(300, 600);
  const order = table.rows().find((o) => o.id === id);
  if (!order?.dispute) return undefined;
  order.dispute = {
    ...order.dispute,
    status: 'answered',
    merchantReply: input.message,
    answeredAt: input.at,
  };
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

// ── the delivery side ───────────────────────────────────────────────────────

/**
 * Everything a given courier has ever carried, newest first.
 *
 * Queried by `courierId` rather than by account: an order records the file that
 * delivered it, and the two are not the same thing (see the note on `Courier`).
 */
export async function getOrdersForCourier(courierId: ID): Promise<Order[]> {
  await table.ready;
  await delay();
  return table
    .rows()
    .filter((o) => o.delivery?.courierId === courierId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(snapshot);
}

/**
 * How far back a seeded courier history reaches, and how busy it is.
 *
 * Thirty days rather than the seed's forty-five: a courier who joined this
 * morning cannot plausibly have six weeks of runs, and thirty still fills the
 * 7-day chart, the range comparison behind it, and a history worth scrolling.
 */
const RUN_HISTORY_DAYS = 30;
/** Shops close enough to the courier's base to be a night's work rather than a commute. */
const RUN_SHOP_POOL = 6;
/** Drop-offs are drawn from the addresses nearest each shop, so a run is a run and not a road trip. */
const RUN_ADDRESS_POOL = 5;

/** Where a courier's shifts sit in the day. Evenings carry the trade; mornings are quiet. */
const RUN_HOURS: { from: number; to: number; weight: number }[] = [
  { from: 11, to: 14, weight: 0.34 },
  { from: 14, to: 17, weight: 0.16 },
  { from: 17, to: 21, weight: 0.5 },
];

/**
 * Give a courier without any runs a plausible history behind them.
 *
 * The courier twin of `ensureDemoOrders`, and it exists for exactly the same
 * reason: only the eight seeded couriers appear on any delivery, so a courier
 * who registers in the app lands on an empty Courses tab, a Gains screen reading
 * 0,00 $, and a profile that says "nouveau" forever. Three of the four courier
 * screens are then demonstrating nothing.
 *
 * Idempotent by construction — it does nothing once this courier is on an
 * order, and after the first call they always are. No separate "seeded" flag,
 * for the reason `ensureDemoOrders` gives.
 *
 * Everything is derived rather than invented: the shops are the ones nearest
 * this courier's base, the drop-offs are the addresses nearest those shops, and
 * the pay comes out of `buildOrder` through `data/courierPay.ts` like every
 * other run in the app. Seeded from the courier id, so a demo shows the same
 * history each launch instead of a number that moves when nothing happened.
 *
 * Returns the runs it created, or an empty array when it did nothing.
 */
export async function ensureDemoRuns(
  courier: Pick<Courier, 'id' | 'base' | 'vehicle'>
): Promise<Order[]> {
  await table.ready;
  if (table.rows().some((o) => o.delivery?.courierId === courier.id)) return [];

  const rng = mulberry32(hashString(`runs:${courier.id}`));

  // Shops this courier would actually be offered, by the same measure the
  // dispatcher ranks with — so the history matches the work they get sent.
  const shops = [...seedVendors]
    .sort((a, b) => distanceKm(courier.base, a.address) - distanceKm(courier.base, b.address))
    .slice(0, RUN_SHOP_POOL)
    .filter((vendor) => seedProducts.some((p) => p.vendorId === vendor.id));
  if (shops.length === 0) return [];

  // Precomputed per shop: sorting the address book inside the day loop would
  // redo the same work ~75 times for no benefit.
  const dropoffsByShop = new Map(
    shops.map((vendor) => [
      vendor.id,
      [...orderAddresses]
        .sort((a, b) => distanceKm(vendor.address, a) - distanceKm(vendor.address, b))
        .slice(0, RUN_ADDRESS_POOL),
    ])
  );

  const shoppers = seedUsers.filter((u) => u.role === 'customer').map((u) => u.id);
  if (shoppers.length === 0) return [];

  const specs: OrderSpec[] = [];
  let n = 0;

  const buildSpec = (createdAt: string): OrderSpec | null => {
    const vendor = shops[Math.floor(rng() * shops.length) % shops.length];
    const pool = seedProducts.filter((p) => p.vendorId === vendor.id);
    if (pool.length === 0) return null;
    const dropoffs = dropoffsByShop.get(vendor.id) ?? orderAddresses;
    const address = dropoffs[Math.floor(rng() * dropoffs.length) % dropoffs.length];

    const lineCount = 1 + Math.floor(rng() * rng() * 3);
    const chosen = new Set<string>();
    const lines: [string, number][] = [];
    for (let i = 0; i <= lineCount; i++) {
      const product = pool[Math.floor(rng() * pool.length) % pool.length];
      if (chosen.has(product.id)) continue;
      chosen.add(product.id);
      lines.push([product.id, rng() < 0.68 ? 1 : 2]);
    }

    return {
      id: `ord_run_${courier.id}_${String(n++).padStart(3, '0')}`,
      // The basket belonged to a shopper; only the delivery leg is this
      // courier's. Attributing it to the courier's own account would put these
      // rows in their Commandes tab if they ever opened the customer app.
      customerId: shoppers[Math.floor(rng() * shoppers.length) % shoppers.length],
      vendorId: vendor.id,
      address,
      lines,
      status: 'delivered',
      courier,
      createdAt,
    };
  };

  // ── The days behind ──
  for (let daysAgo = RUN_HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    // Couriers take days off. Without this every bar on the chart is the same
    // height and the history reads as generated, which it is.
    if (rng() < 0.18) continue;
    const weekday = new Date(Date.now() - daysAgo * 86400000).getDay();
    // Friday and Saturday are the delivery nights; Sunday and Monday are thin.
    const busy = weekday === 5 || weekday === 6 ? 1.6 : weekday === 0 || weekday === 1 ? 0.7 : 1;
    const count = Math.max(1, Math.round((2 + rng() * 2.4) * busy));

    for (let i = 0; i < count; i++) {
      const slot = pickHour(rng);
      const hour = Math.floor(slot);
      const minute = Math.floor((slot - hour) * 60);
      const spec = buildSpec(localIsoAt(daysAgo, hour, minute));
      if (spec) specs.push(spec);
    }
  }

  // ── Today ──
  // Placed by minutes-ago rather than by clock time: a run has to be old enough
  // that its own delivered step (+57 min in the happy path) has already passed,
  // or the history opens with a delivery timestamped in the future.
  const minutesOpen = new Date().getHours() * 60 + new Date().getMinutes();
  for (const minutesAgo of [95, 215, 340]) {
    if (minutesAgo + 70 > minutesOpen) continue;
    const spec = buildSpec(localMinutesAgo(minutesAgo));
    if (spec) specs.push(spec);
  }

  const created = specs.map(buildOrder);
  for (const order of created) {
    await table.add(order);
  }
  return created;
}

/** Weighted pick of an hour-of-day, as a fractional hour. */
function pickHour(rng: () => number): number {
  let roll = rng();
  let slot = RUN_HOURS[RUN_HOURS.length - 1];
  for (const candidate of RUN_HOURS) {
    if (roll < candidate.weight) {
      slot = candidate;
      break;
    }
    roll -= candidate.weight;
  }
  return slot.from + rng() * (slot.to - slot.from);
}

/**
 * What the dispatcher is allowed to offer.
 *
 * `ready` and nobody assigned: the shop has finished packing and no courier has
 * accepted. An order still `preparing` is not offerable — a courier who arrives
 * before the food does is a courier standing in a kitchen.
 */
export async function getDispatchableOrders(): Promise<Order[]> {
  await table.ready;
  await delay(200, 400);
  return table
    .rows()
    .filter((o) => o.status === 'ready' && !o.delivery)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(snapshot);
}

export interface AcceptQuote {
  /** Courier's position when they accepted, for the leg to the shop. */
  from: LatLng;
  pickup: LatLng;
  dropoff: LatLng;
  vehicle: VehicleType;
  tipCad?: number;
}

/**
 * A courier takes the run.
 *
 * Deliberately refuses an order that already has a courier rather than
 * overwriting: two couriers can tap Accepter within the same second, and the
 * loser needs to be told, not silently handed a delivery someone else is
 * already driving. Note this does **not** advance the status — picking the food
 * up is a separate act, and `ready` is still the truth until it happens.
 */
export async function assignCourier(
  orderId: ID,
  courierId: ID,
  at: string,
  quote: AcceptQuote
): Promise<Order | undefined> {
  await table.ready;
  await delay(300, 600);
  const order = table.rows().find((o) => o.id === orderId);
  if (!order || order.delivery) return undefined;

  const runKm = Math.round(distanceKm(quote.pickup, quote.dropoff) * 100) / 100;
  const tipCad = quote.tipCad ?? 0;
  order.delivery = {
    courierId,
    acceptedAt: at,
    pickupEtaMin: legDurationMin(distanceKm(quote.from, quote.pickup), quote.vehicle),
    dropoffEtaMin: legDurationMin(runKm, quote.vehicle),
    distanceKm: runKm,
    pin: deliveryPin(orderId),
    tipCad,
    earningsCad: courierEarnings(runKm, tipCad),
  };
  await table.save(order.id);
  return snapshot(order);
}

/** The courier has the bag. Paired with the `ready` -> `out_for_delivery` advance. */
export async function markPickedUp(orderId: ID, at: string): Promise<Order | undefined> {
  await table.ready;
  await delay();
  const order = table.rows().find((o) => o.id === orderId);
  if (!order?.delivery) return undefined;
  order.delivery.pickedUpAt = at;
  order.status = 'out_for_delivery';
  order.statusHistory.push({ status: 'out_for_delivery', at });
  await table.save(order.id);
  return snapshot(order);
}

/**
 * The run is finished, with evidence.
 *
 * Proof and status land in one call on purpose: an order marked delivered with
 * no proof is exactly the state a dispute turns on, and letting the two drift
 * apart would make it reachable by closing a screen at the wrong moment.
 */
export async function completeDelivery(
  orderId: ID,
  proof: DeliveryProof,
  at: string
): Promise<Order | undefined> {
  await table.ready;
  await delay(300, 600);
  const order = table.rows().find((o) => o.id === orderId);
  if (!order?.delivery) return undefined;
  order.delivery.proof = proof;
  order.delivery.deliveredAt = at;
  order.status = 'delivered';
  order.statusHistory.push({ status: 'delivered', at });
  await table.save(order.id);
  return snapshot(order);
}

/**
 * The courier flags a problem.
 *
 * Writes onto the order and changes nothing else — see `CourierIssue`. The run
 * stays open, because a courier standing outside a locked building still has
 * someone's dinner and the order is not resolved until it is somewhere.
 */
export async function reportCourierIssue(
  id: ID,
  reason: CourierIssueReason,
  message: string,
  at: string
): Promise<Order | undefined> {
  await table.ready;
  await delay(400, 700);
  const order = table.rows().find((o) => o.id === id);
  if (!order || order.courierIssue) return undefined;
  const issue: CourierIssue = { reason, message, at };
  order.courierIssue = issue;
  await table.save(order.id);
  return snapshot(order);
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
