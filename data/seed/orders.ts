import type { Address, Order, OrderItem, OrderStatus } from '../types';
import { addMinutesIso, minutesOfDay, localIsoAt, localMinutesAgo, localWeekday } from '../utils/time';
import { products } from './products';
import { users } from './users';
import { vendors } from './vendors';

/**
 * Orders are declared as a compact spec and assembled below.
 *
 * Hand-writing full `Order` objects means hand-summing `subtotalCad`,
 * `deliveryFeeCad` and `totalCad` and hand-typing product names and prices —
 * every one of which can silently disagree with the catalogue. Here the builder
 * resolves each line against `products`, takes the fee from `vendors`, and
 * derives the totals and the status history, so the numbers cannot drift and a
 * price change in the catalogue flows straight through.
 *
 * **Every timestamp is relative to launch.** Dates used to be fixed strings,
 * which meant the shop dashboards were only correct on the day they were
 * written: a week later the 7-day chart was blank and the order queue empty. See
 * `data/utils/time.ts`.
 */
const addresses: Record<string, Address> = {
  aissatou: addr('addr_usr_1', 'Domicile', '3450 Rue Jean-Talon Est', 'Montréal', 'H1X 1G8', 45.5605, -73.6021),
  omar: addr('addr_usr_2', 'Domicile', '785 Avenue Beaumont', 'Montréal', 'H3N 1V1', 45.5301, -73.6338),
  nadia: addr('addr_usr_3', 'Bureau', '2900 Boulevard Saint-Martin Ouest', 'Laval', 'H7T 2J2', 45.5657, -73.7481),
  eric: addr('addr_usr_4', 'Domicile', '210 Rue Guillaume', 'Longueuil', 'J4H 3A4', 45.5389, -73.5142),
  amina: addr('addr_usr_5', 'Domicile', '1425 Rue Jarry Est', 'Montréal', 'H2E 1A7', 45.5539, -73.6188),
  samir: addr('addr_usr_6', 'Domicile', '5180 Rue Saint-Denis', 'Montréal', 'H2J 2L9', 45.5289, -73.5921),
  grace: addr('addr_usr_7', 'Domicile', '7340 Boulevard Saint-Michel', 'Montréal', 'H2A 3A1', 45.5702, -73.6018),
  youssef: addr('addr_usr_8', 'Domicile', '990 Boulevard Curé-Labelle', 'Laval', 'H7V 2V7', 45.5588, -73.7452),
  fanta: addr('addr_usr_9', 'Domicile', '3120 Rue Ontario Est', 'Montréal', 'H1W 1P2', 45.5442, -73.5426),
  marc: addr('addr_usr_10', 'Domicile', '455 Rue Fleury Ouest', 'Montréal', 'H3L 1T7', 45.5486, -73.6669),
  hawa: addr('addr_usr_11', 'Domicile', '6120 Avenue Victoria', 'Montréal', 'H3W 2R9', 45.4959, -73.6349),
  rachid: addr('addr_usr_12', 'Domicile', '2255 Boulevard Henri-Bourassa Est', 'Montréal', 'H2B 1T3', 45.5766, -73.6503),
  zeinab: addr('addr_usr_13', 'Bureau', '1810 Rue Sherbrooke Ouest', 'Montréal', 'H3H 1E4', 45.4952, -73.5836),
  kwame: addr('addr_usr_14', 'Domicile', '840 Rue Adoncour', 'Longueuil', 'J4G 2M6', 45.5488, -73.4802),
};

function addr(
  id: string,
  label: string,
  street: string,
  city: string,
  postalCode: string,
  lat: number,
  lng: number
): Address {
  return { id, label, street, city, postalCode, lat, lng, isDefault: true };
}

export interface OrderSpec {
  id: string;
  customerId: string;
  customerName?: string;
  vendorId: string;
  /** A key into the seeded address book, or a literal address for runtime specs. */
  address: keyof typeof addresses | Address;
  lines: [productId: string, qty: number][];
  status: OrderStatus;
  /** Device-local wall-clock time with an explicit offset; the app formats with fr-CA. */
  createdAt: string;
}

/** One hand-written order, dated relative to launch instead of to a calendar. */
type NarrativeSpec = Omit<OrderSpec, 'createdAt'> &
  ({ daysAgo: number; at: string } | { minutesAgo: number });

function resolveNarrative(spec: NarrativeSpec): OrderSpec {
  const { ...rest } = spec;
  if ('minutesAgo' in spec) {
    const { minutesAgo: _m, ...fields } = rest as NarrativeSpec & { minutesAgo: number };
    return { ...fields, createdAt: localMinutesAgo(spec.minutesAgo) } as OrderSpec;
  }
  const { daysAgo: _d, at: _a, ...fields } = rest as NarrativeSpec & { daysAgo: number; at: string };
  const [hour, minute] = spec.at.split(':').map(Number);
  return { ...fields, createdAt: localIsoAt(spec.daysAgo, hour, minute) } as OrderSpec;
}

/**
 * Hand-written orders, kept for the narrative they carry: the demo customer's
 * own history, one order at each stage of the pipeline, a cancellation. The
 * generator below supplies volume; these supply the specific cases a demo walks
 * through.
 */
const narrative: NarrativeSpec[] = [
  { id: 'ord_1001', customerId: 'usr_customer_demo', vendorId: 'vnd_saveurs_dakar', address: 'aissatou', lines: [['prd_thieboudienne', 1], ['prd_jus_bissap', 2]], status: 'delivered', daysAgo: 12, at: '18:12' },
  { id: 'ord_1002', customerId: 'usr_customer_demo', vendorId: 'vnd_douceurs_maghreb', address: 'aissatou', lines: [['prd_cornes_gazelle', 1], ['prd_lben', 2]], status: 'delivered', daysAgo: 9, at: '11:05' },
  { id: 'ord_1003', customerId: 'usr_customer_demo', vendorId: 'vnd_marche_bamako', address: 'aissatou', lines: [['prd_mangue_kent', 3], ['prd_banane_plantain', 2], ['prd_gombo_frais', 1]], status: 'out_for_delivery', minutesAgo: 44 },
  { id: 'ord_1004', customerId: 'usr_customer_demo', vendorId: 'vnd_epicerie_atlas', address: 'aissatou', lines: [['prd_couscous_moyen', 1], ['prd_ras_el_hanout', 1], ['prd_harissa_artisanale', 2]], status: 'preparing', minutesAgo: 17 },
  { id: 'ord_1005', customerId: 'usr_customer_demo', vendorId: 'vnd_boucherie_sahel', address: 'aissatou', lines: [['prd_merguez_maison', 2]], status: 'cancelled', daysAgo: 7, at: '09:30' },
  { id: 'ord_1016', customerId: 'usr_customer_demo', vendorId: 'vnd_boulangerie_tanit', address: 'aissatou', lines: [['prd_msemen', 2], ['prd_cafe_turc', 1]], status: 'delivered', daysAgo: 21, at: '08:25' },
  { id: 'ord_1023', customerId: 'usr_customer_demo', vendorId: 'vnd_mama_adjoa', address: 'aissatou', lines: [['prd_soupe_arachide', 1]], status: 'cancelled', daysAgo: 3, at: '20:10' },

  // One order at each remaining pipeline stage, so every status is reachable on
  // a shop's queue on the first launch without waiting for one to be placed.
  { id: 'ord_1009', customerId: 'usr_customer_eric', vendorId: 'vnd_teranga', address: 'eric', lines: [['prd_riz_parfume', 2]], status: 'confirmed', minutesAgo: 8 },
  { id: 'ord_1012', customerId: 'usr_customer_nadia', vendorId: 'vnd_souk_medina', address: 'nadia', lines: [['prd_briouates', 2], ['prd_dattes_deglet', 1]], status: 'ready', minutesAgo: 26 },
  { id: 'ord_1015', customerId: 'usr_customer_omar', vendorId: 'vnd_kilimandjaro', address: 'omar', lines: [['prd_chapati', 2], ['prd_arachides_grillees', 1]], status: 'pending', minutesAgo: 3 },
  { id: 'ord_1019', customerId: 'usr_customer_omar', vendorId: 'vnd_boulangerie_tanit', address: 'omar', lines: [['prd_baghrir', 2]], status: 'preparing', minutesAgo: 12 },
  { id: 'ord_1022', customerId: 'usr_customer_eric', vendorId: 'vnd_mama_adjoa', address: 'eric', lines: [['prd_attieke_poisson', 2], ['prd_puff_puff', 1]], status: 'out_for_delivery', minutesAgo: 35 },
];

// ── Generated volume ────────────────────────────────────────────────────────
//
// Ten shops sharing 28 hand-written orders left each merchant with two or three
// to their name: a dashboard reading ~$150 of all-time revenue, a 30-day chart
// with three bars, and a "best sellers" list where everything had sold once. The
// generator gives every shop its own trading history instead.
//
// It is seeded per vendor and never calls Math.random, so ids and figures are
// identical on every launch — the persisted table layers stored rows over these
// by id, and a table whose ids shuffled each start would accumulate duplicates.

const HISTORY_DAYS = 45;

/** Deterministic PRNG. Small, well-distributed, and stable across engines. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const customerIds = users.filter((u) => u.role === 'customer').map((u) => u.id);
/** Address book keys, in the same order as the customers they belong to. */
const addressKeys = Object.keys(addresses) as (keyof typeof addresses)[];

/**
 * Where a shop's orders cluster during the day. Groceries are a lunch-and-after-
 * work errand, not a flat distribution, and the day strip on the dashboard plots
 * these — a uniform spread would draw a meaningless comb.
 */
const DAY_PARTS: { weight: number; from: number; to: number }[] = [
  { weight: 0.22, from: 9 * 60, to: 11 * 60 },
  { weight: 0.32, from: 11 * 60 + 30, to: 13 * 60 + 30 },
  { weight: 0.14, from: 13 * 60 + 30, to: 16 * 60 + 30 },
  { weight: 0.32, from: 16 * 60 + 30, to: 19 * 60 + 30 },
];

/** Minutes-ago for an order currently at each live status, clear of its own step offsets. */
const LIVE_STAGES: { status: OrderStatus; minutesAgo: number }[] = [
  { status: 'pending', minutesAgo: 2 },
  { status: 'confirmed', minutesAgo: 6 },
  { status: 'preparing', minutesAgo: 15 },
  { status: 'preparing', minutesAgo: 22 },
  { status: 'ready', minutesAgo: 31 },
  { status: 'out_for_delivery', minutesAgo: 47 },
];

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function pickTimeOfDay(rng: () => number, openMin: number, closeMin: number): number {
  let roll = rng();
  let part = DAY_PARTS[DAY_PARTS.length - 1];
  for (const candidate of DAY_PARTS) {
    if (roll < candidate.weight) {
      part = candidate;
      break;
    }
    roll -= candidate.weight;
  }
  // Clamp into the shop's actual trading hours — a bakery closing at 15:00 must
  // not take an evening order.
  const from = Math.max(part.from, openMin + 20);
  const to = Math.min(part.to, closeMin - 25);
  if (to <= from) return Math.max(openMin + 20, Math.min(closeMin - 25, (openMin + closeMin) / 2));
  return from + rng() * (to - from);
}

function buildLines(rng: () => number, pool: typeof products): [string, number][] {
  const lineCount = 1 + Math.floor(rng() * rng() * 4);
  const chosen = new Set<string>();
  const lines: [string, number][] = [];
  for (let i = 0; i < lineCount; i++) {
    const product = pick(rng, pool);
    if (chosen.has(product.id)) continue;
    chosen.add(product.id);
    // Most lines are a single unit; the tail is what makes a basket look real.
    const qty = rng() < 0.62 ? 1 : rng() < 0.8 ? 2 : 3;
    lines.push([product.id, qty]);
  }
  return lines.length > 0 ? lines : [[pool[0].id, 1]];
}

function generateForVendor(vendorIndex: number): NarrativeSpec[] {
  const vendor = vendors[vendorIndex];
  const rng = mulberry32(hashString(vendor.id));
  const pool = products.filter((p) => p.vendorId === vendor.id);
  if (pool.length === 0) return [];

  const specs: NarrativeSpec[] = [];
  let n = 0;
  const nextId = () => `ord_g${vendorIndex}_${String(n++).padStart(3, '0')}`;

  const customerFor = () => {
    const index = Math.floor(rng() * customerIds.length) % customerIds.length;
    return { customerId: customerIds[index], address: addressKeys[index % addressKeys.length] };
  };

  // ── Closed history ──
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    const weekday = localWeekday(daysAgo);
    const hours = vendor.hours.find((h) => h.day === weekday);
    if (!hours || hours.closed) continue;

    // Fridays and Saturdays are the grocery run; Sundays are quiet. Recent weeks
    // are busier so the 7-day view has something in every bar rather than
    // trailing off into a flat line.
    const dayWeight = weekday === 5 || weekday === 6 ? 1.8 : weekday === 0 ? 0.6 : 1;
    const recency = daysAgo <= 7 ? 1.4 : daysAgo <= 30 ? 1.05 : 0.75;
    // Tuned against the live queue below, not picked for its own sake: at 0.6 a
    // shop averaged one order a day while carrying five in its queue, so
    // "today" towered over every other bar on the revenue chart and the history
    // read as a different business from the one on the dashboard.
    const expected = 1.05 * dayWeight * recency;

    let count = Math.floor(expected);
    if (rng() < expected - count) count += 1;

    const openMin = minutesOfDay(hours.open);
    const closeMin = minutesOfDay(hours.close);

    for (let i = 0; i < count; i++) {
      const minutes = pickTimeOfDay(rng, openMin, closeMin);
      const { customerId, address } = customerFor();
      specs.push({
        id: nextId(),
        customerId,
        vendorId: vendor.id,
        address,
        lines: buildLines(rng, pool),
        // A cancellation rate a merchant would recognise, and enough of them
        // that the status mix on Analytique is not a single bar.
        status: rng() < 0.07 ? 'cancelled' : 'delivered',
        daysAgo,
        at: clock(minutes),
      });
    }
  }

  // ── Today ──
  // Orders already closed out this morning, but only as far back as the shop has
  // actually been open — otherwise a demo run at 08:00 shows deliveries from 02:00.
  const todayHours = vendor.hours.find((h) => h.day === localWeekday(0));
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const openedMinutesAgo =
    todayHours && !todayHours.closed ? nowMinutes - minutesOfDay(todayHours.open) : 0;

  const closedToday = Math.min(3, Math.max(0, Math.floor((openedMinutesAgo - 90) / 150)));
  for (let i = 0; i < closedToday; i++) {
    const { customerId, address } = customerFor();
    specs.push({
      id: nextId(),
      customerId,
      vendorId: vendor.id,
      address,
      lines: buildLines(rng, pool),
      status: 'delivered',
      // Spread across the morning, each clear of the 57-minute delivered step.
      minutesAgo: 80 + i * 95 + Math.floor(rng() * 40),
    });
  }

  // The live queue: what the merchant opens the app to deal with. Every shop
  // gets one, because an empty "À traiter" is the first thing a demo would see.
  //
  // The slice starts at a per-shop offset and wraps, so the ten shops between
  // them cover every live status. Taking the first N instead left `ready` and
  // `out_for_delivery` on one order each across the whole seed, and a status
  // nothing reaches is a status nobody can see styled.
  const liveCount = 3 + Math.floor(rng() * 2);
  const start = Math.floor(rng() * LIVE_STAGES.length);
  const liveStages = Array.from(
    { length: liveCount },
    (_, i) => LIVE_STAGES[(start + i) % LIVE_STAGES.length]
  );
  for (const stage of liveStages) {
    // While the shop is trading, an order cannot have arrived before it opened —
    // and the day strip plots against opening hours, so one that did would be
    // dropped from the picture while still counting in the queue. Outside
    // trading hours these stay as they are: a queue waiting at the door.
    const minutesAgo =
      openedMinutesAgo > 0 ? Math.min(stage.minutesAgo, openedMinutesAgo) : stage.minutesAgo;
    // The status history is built by adding this status's step offset to the
    // creation time, so an order younger than its own offset would carry
    // timestamps in the future.
    if (minutesAgo < (STEP_OFFSETS[stage.status] ?? 0)) continue;

    const { customerId, address } = customerFor();
    specs.push({
      id: nextId(),
      customerId,
      vendorId: vendor.id,
      address,
      lines: buildLines(rng, pool),
      status: stage.status,
      minutesAgo,
    });
  }

  return specs;
}

function clock(minutes: number): string {
  const total = Math.round(minutes);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// ── Assembly ────────────────────────────────────────────────────────────────

/** Minutes after `createdAt` at which each step of the happy path lands. */
const STEP_OFFSETS: Partial<Record<OrderStatus, number>> = {
  pending: 0,
  confirmed: 3,
  preparing: 9,
  ready: 21,
  out_for_delivery: 28,
  delivered: 57,
};

const HAPPY_PATH: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
];

function buildStatusHistory(status: OrderStatus, createdAt: string) {
  if (status === 'cancelled') {
    return [
      { status: 'pending' as OrderStatus, at: createdAt },
      { status: 'cancelled' as OrderStatus, at: addMinutesIso(createdAt, 6) },
    ];
  }
  const upTo = HAPPY_PATH.indexOf(status);
  return HAPPY_PATH.slice(0, upTo + 1).map((step) => ({
    status: step,
    at: addMinutesIso(createdAt, STEP_OFFSETS[step] ?? 0),
  }));
}

const productById = new Map(products.map((p) => [p.id, p]));
const vendorById = new Map(vendors.map((v) => [v.id, v]));

/**
 * Exported so runtime demo data (see `data/api/orders.ts`) is assembled by the
 * same builder as the seed: totals derived from the catalogue, fee from the
 * vendor, status history from the happy path. Two builders would eventually
 * disagree, and `scripts/verify-seed.ts` only checks this one.
 */
export function buildOrder(spec: OrderSpec): Order {
  const items: OrderItem[] = spec.lines.map(([productId, qty]) => {
    const product = productById.get(productId);
    // Fail loudly at module load rather than shipping an order that references
    // a product that no longer exists.
    if (!product) throw new Error(`Seed order ${spec.id} references unknown product ${productId}`);
    return { productId, name: product.name, qty, unitPriceCad: product.priceCad };
  });

  const vendor = vendorById.get(spec.vendorId);
  if (!vendor) throw new Error(`Seed order ${spec.id} references unknown vendor ${spec.vendorId}`);

  const subtotalCad = round2(items.reduce((sum, i) => sum + i.unitPriceCad * i.qty, 0));
  const deliveryFeeCad = vendor.deliveryFeeCad;

  return {
    id: spec.id,
    customerId: spec.customerId,
    customerName: spec.customerName,
    vendorId: spec.vendorId,
    items,
    status: spec.status,
    subtotalCad,
    deliveryFeeCad,
    totalCad: round2(subtotalCad + deliveryFeeCad),
    deliveryAddress: typeof spec.address === 'string' ? addresses[spec.address] : spec.address,
    createdAt: spec.createdAt,
    statusHistory: buildStatusHistory(spec.status, spec.createdAt),
  };
}

/** Money is summed from floats, so round once at the boundary. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const generated = vendors.flatMap((_, index) => generateForVendor(index));

export const orders: Order[] = [...narrative, ...generated]
  .map(resolveNarrative)
  .map(buildOrder);
