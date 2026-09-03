/**
 * Development seed — fills an empty Supabase project with a plausible
 * marketplace so the admin back office has something to show.
 *
 * Run:  npm run db:seed -- --yes
 * Undo: npm run db:seed:reset -- --yes
 *
 * ── Safety ─────────────────────────────────────────────────────────────────
 *
 * Four independent guards, in decreasing order of how much they matter:
 *
 *   1. **Namespaced ids** (`ids.ts`). Every row is `5eed…`, and teardown
 *      deletes only rows matching that prefix. The script is structurally
 *      incapable of deleting a row it did not create, whatever the flags say.
 *   2. Refuses when `NODE_ENV=production`.
 *   3. Requires `--yes`, after printing the target host.
 *   4. Refuses when the database already holds rows this script did not write,
 *      unless `--force` — which catches a `DATABASE_URL` pointed at a real
 *      database that simply isn't labelled production.
 *
 * Not a migration: migrations run in production, are checksummed, can never be
 * re-run, and CI's drift check would object. `0007_seed_categories.sql` is a
 * migration because those 8 categories are reference data the product needs;
 * 40 invented people are not.
 */
import { sql, type InferInsertModel } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { createDbClient } from '../../src/db/client.js';
import {
  addresses,
  courierIssues,
  couriers,
  courierInsurance,
  disputes,
  orderDeliveries,
  orderItems,
  orders,
  orderStatusHistory,
  products,
  profiles,
  vendorCategories,
  vendorHours,
  vendorRegistrations,
  vendorSections,
  vendors,
} from '../../src/db/schema/index.js';
import { deleteSeedAuthUsers, ensureAuthUsers, type SeedPerson } from './auth-users.js';
import {
  CATEGORY_IDS,
  COURIERS,
  COURIER_ISSUE_MESSAGES,
  COURIER_ISSUE_REASONS,
  CUSTOMERS,
  DISPUTE_MESSAGES,
  DISPUTE_REASONS,
  ITEM_BANK,
  SECTION_NAMES,
  VENDORS,
} from './fixtures.js';
import { Family, isSeedEmail, seedEmail, seedId, SEED_ID_LIKE_PATTERN } from './ids.js';
import { cents, hashString, intBetween, mulberry32, pick } from './rng.js';

// ── configuration ───────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const CONFIRMED = args.has('--yes') || process.env.SEED_CONFIRM === '1';
const RESET_ONLY = args.has('--reset');
const FORCE = args.has('--force');

// Checked before anything else reads the environment: a missing var must never
// be the thing that stops a production run, because then the real guard was
// never reached and nobody learns it works.
if (process.env.NODE_ENV === 'production') {
  console.error('✗ Refusing to run the dev seed with NODE_ENV=production.');
  process.exit(1);
}

const DATABASE_URL = required('DATABASE_URL');
const SUPABASE_URL = required('SUPABASE_URL');
const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@sougouba.ca';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'sougouba-admin';
const ADMIN_NAME = 'Salif Sogodogo';
/** One shared password for every fixture account — these are throwaway logins. */
const SEED_PASSWORD = 'sougouba-seed';

/** Deterministic across runs, so a re-seed rewrites the same dataset in place. */
const rand = mulberry32(hashString('sougouba-admin-seed-v1'));

const DAYS_OF_HISTORY = 60;
const GST_RATE = 0.05;
const QST_RATE = 0.09975;

/** The happy path, in order — a delivered order carries every step before it. */
const ORDER_FLOW = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'] as const;
type OrderStatus = (typeof ORDER_FLOW)[number] | 'cancelled';

/** The statuses that mean "still moving" — what `ordersActive` counts. */
const IN_FLIGHT = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] as const;

/**
 * Orders per approved shop that are forced to be live, placed in the last ~36
 * hours.
 *
 * Guaranteed rather than left to chance. Making in-flight orders depend on a
 * random `daysAgo < 2` gave about three candidates across the whole run, each
 * with a coin-flip — so roughly one run in ten seeded **zero** of them, and the
 * back office's "commandes actives" and "non assignées" tiles, the two numbers
 * `AdminService.stats()` describes as the ones that actually need watching, sat
 * at 0 with nothing to click. A fixture set that cannot exercise the screens it
 * exists for is not doing its job.
 */
const LIVE_ORDERS_PER_VENDOR = 2;

/**
 * Rows are inserted in batches rather than one statement at a time.
 *
 * The first version awaited every insert individually: ~2,700 round trips to
 * the pooler in Ireland, which took about fifteen minutes. A seed people are
 * expected to re-run has to be faster than that or they stop re-running it.
 */
const INSERT_CHUNK = 500;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ ${name} is not set. Run through \`npm run db:seed\`, which loads .env.`);
    process.exit(1);
  }
  return value;
}

const db = createDbClient(DATABASE_URL);

/**
 * Multi-row insert, chunked.
 *
 * Postgres allows at most 65,535 bind parameters per statement, so a 20-column
 * table tops out near 3,000 rows — `INSERT_CHUNK` sits well under that for the
 * widest table here. Empty arrays are skipped: Drizzle would build `values ()`,
 * which Postgres rejects.
 */
async function insertAll<T extends PgTable>(table: T, rows: InferInsertModel<T>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.insert(table).values(rows.slice(i, i + INSERT_CHUNK)).onConflictDoNothing();
  }
}

// ── guards ──────────────────────────────────────────────────────────────────

async function assertSafe(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('✗ Refusing to run with NODE_ENV=production.');
    process.exit(1);
  }

  const host = new URL(DATABASE_URL).hostname;
  console.log(`  target   ${host}`);
  console.log(`  mode     ${RESET_ONLY ? 'RESET (delete seeded rows)' : 'SEED'}`);

  if (!CONFIRMED) {
    console.error('\n✗ Refusing to touch the database without --yes.');
    console.error('  Re-run as: npm run db:seed -- --yes');
    process.exit(1);
  }

  // The guard the other three miss: a database that is real but not labelled
  // production. Counts rows this script could not have written.
  const [foreign] = await db.execute<{ vendors: number; orders: number; couriers: number }>(sql`
    select (select count(*) from vendors  where id::text not like ${SEED_ID_LIKE_PATTERN})::int as vendors,
           (select count(*) from orders   where id::text not like ${SEED_ID_LIKE_PATTERN})::int as orders,
           (select count(*) from couriers where id::text not like ${SEED_ID_LIKE_PATTERN})::int as couriers
  `);

  const total = (foreign?.vendors ?? 0) + (foreign?.orders ?? 0) + (foreign?.couriers ?? 0);
  if (total > 0 && !FORCE) {
    console.error(
      `\n✗ This database holds ${total} row(s) this script did not create ` +
        `(${foreign?.vendors} vendors, ${foreign?.orders} orders, ${foreign?.couriers} couriers).`
    );
    console.error('  That usually means DATABASE_URL points somewhere real. Pass --force only if you are certain.');
    process.exit(1);
  }
}

// ── teardown ────────────────────────────────────────────────────────────────

/**
 * Deletes only `5eed…` rows. Ordered child-first so a missing cascade cannot
 * leave an orphan; most of these do cascade, and the explicit order costs
 * nothing and documents the graph.
 */
async function reset(): Promise<void> {
  const like = SEED_ID_LIKE_PATTERN;

  await db.execute(sql`delete from courier_issues       where order_id::text like ${like}`);
  await db.execute(sql`delete from disputes             where order_id::text like ${like}`);
  await db.execute(sql`delete from delivery_proofs      where order_id::text like ${like}`);
  await db.execute(sql`delete from order_deliveries     where order_id::text like ${like}`);
  await db.execute(sql`delete from order_status_history where order_id::text like ${like}`);
  await db.execute(sql`delete from order_items          where order_id::text like ${like}`);
  await db.execute(sql`delete from orders               where id::text       like ${like}`);
  await db.execute(sql`delete from addresses            where id::text       like ${like}`);
  await db.execute(sql`delete from products             where id::text       like ${like}`);
  await db.execute(sql`delete from vendor_categories    where vendor_id::text like ${like}`);
  await db.execute(sql`delete from vendor_hours         where vendor_id::text like ${like}`);
  await db.execute(sql`delete from vendor_registrations where vendor_id::text like ${like}`);
  await db.execute(sql`delete from vendor_sections      where vendor_id::text like ${like}`);
  await db.execute(sql`delete from courier_insurance    where courier_id::text like ${like}`);
  // Break the profile back-links before the rows they point at disappear.
  await db.execute(sql`update profiles set vendor_id = null, courier_id = null
                       where vendor_id::text like ${like} or courier_id::text like ${like}`);
  await db.execute(sql`delete from couriers             where id::text like ${like}`);
  await db.execute(sql`delete from vendors              where id::text like ${like}`);

  const removed = await deleteSeedAuthUsers({ supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY }, isSeedEmail);
  console.log(`  removed  ${removed} seeded auth account(s) (the admin account is kept)`);
}

// ── seed ────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  // 1 ─ accounts. The `handle_new_user` trigger creates each `profiles` row.
  const people: SeedPerson[] = [
    ...VENDORS.map((v) => ({ key: `vendor:${v.key}`, email: seedEmail(`shop.${v.key}`), fullName: v.ownerName, password: SEED_PASSWORD })),
    ...COURIERS.map((c) => ({ key: `courier:${c.key}`, email: seedEmail(`courier.${c.key}`), fullName: c.fullName, password: SEED_PASSWORD })),
    ...CUSTOMERS.map((c) => ({ key: `customer:${c.key}`, email: seedEmail(`client.${c.key}`), fullName: c.fullName, password: SEED_PASSWORD })),
  ];

  const { ids, created, reused } = await ensureAuthUsers(
    { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY },
    people
  );
  console.log(`  accounts ${created} created, ${reused} reused`);

  // The admin, separately: it is not a `seed.` address, so a reset leaves it be.
  const adminRes = await ensureAuthUsers(
    { supabaseUrl: SUPABASE_URL, serviceRoleKey: SERVICE_ROLE_KEY },
    [{ key: 'admin', email: ADMIN_EMAIL, fullName: ADMIN_NAME, password: ADMIN_PASSWORD }]
  );
  const adminId = adminRes.ids.get('admin')!;

  const now = Date.now();
  const id = (key: string) => ids.get(key)!;

  // 2 ─ roles and join dates. Never an insert: the trigger already made these.
  await db.execute(sql`update profiles set role = 'admin' where id = ${adminId}`);
  for (const [index, person] of people.entries()) {
    const role = person.key.startsWith('vendor:') ? 'business' : person.key.startsWith('courier:') ? 'courier' : 'customer';
    // Spread joining dates across the past year — otherwise every account
    // reads as created today and "membre depuis" is useless on every screen.
    const memberSince = new Date(now - (30 + index * 17) * 86_400_000);
    // `::role` — the enum is named `role`, matching `roleEnum` in
    // `src/db/schema/identity.ts`. A bare string parameter has no type Postgres
    // can infer here, so the cast is required.
    await db.execute(sql`update profiles set role = ${role}::role, member_since = ${memberSince.toISOString()}
                         where id = ${id(person.key)}`);
  }

  // 3 ─ shops.
  const vendorIdOf = new Map<string, string>();
  for (const [index, v] of VENDORS.entries()) {
    const vendorId = seedId(Family.Vendor, index);
    vendorIdOf.set(v.key, vendorId);
    const decided = v.status !== 'pending';
    await db
      .insert(vendors)
      .values({
        id: vendorId,
        slug: v.slug,
        name: v.name,
        vendorType: v.vendorType,
        specialtyFr: v.specialtyFr,
        city: v.city,
        neighborhood: v.neighborhood,
        addressStreet: v.addressStreet,
        addressPostalCode: v.addressPostalCode,
        addressLat: v.lat,
        addressLng: v.lng,
        rating: (3.9 + rand() * 1.0).toFixed(1),
        reviewCount: intBetween(rand, 12, 340),
        deliveryEtaMin: intBetween(rand, 25, 60),
        isHalalCertified: v.categoryKeys.includes('viandeHalal'),
        ownerId: id(`vendor:${v.key}`),
        status: v.status,
        statusReason: v.statusReason ?? null,
        reviewedBy: decided ? adminId : null,
        reviewedAt: decided ? new Date(now - intBetween(rand, 20, 200) * 86_400_000) : null,
        createdAt: new Date(now - intBetween(rand, 200, 400) * 86_400_000),
      })
      .onConflictDoUpdate({ target: vendors.id, set: { name: v.name, status: v.status, statusReason: v.statusReason ?? null } });

    // A file under review needs the paperwork the reviewer is looking at.
    await db
      .insert(vendorRegistrations)
      .values({
        vendorId,
        neq: `11${String(70000000 + index * 137).slice(0, 8)}`,
        contactName: v.ownerName,
        contactPhone: `+1514555${String(1000 + index).slice(-4)}`,
        mapaqNumber: v.vendorType === 'restaurant' ? `MAPAQ-${900000 + index}` : null,
      })
      .onConflictDoNothing();

    for (const [position, nameFr] of SECTION_NAMES.entries()) {
      await db
        .insert(vendorSections)
        .values({ id: seedId(Family.Section, index * 100 + position), vendorId, nameFr, position })
        .onConflictDoNothing();
    }

    for (let day = 0; day < 7; day += 1) {
      await db
        .insert(vendorHours)
        .values({ vendorId, day, open: day === 0 ? '10:00' : '08:00', close: day === 0 ? '17:00' : '20:00', closed: false })
        .onConflictDoNothing();
    }

    for (const key of v.categoryKeys) {
      await db.insert(vendorCategories).values({ vendorId, categoryId: CATEGORY_IDS[key] }).onConflictDoNothing();
    }
  }

  // 4 ─ products. `order_items.product_id` is NOT NULL, so orders need these.
  const productsOf = new Map<string, { id: string; name: string; priceCents: number }[]>();
  for (const [vIndex, v] of VENDORS.entries()) {
    const vendorId = vendorIdOf.get(v.key)!;
    const list: { id: string; name: string; priceCents: number }[] = [];
    for (const [iIndex, item] of ITEM_BANK.entries()) {
      const productId = seedId(Family.Product, vIndex * 100 + iIndex);
      // A product must sit in an aisle *of its own shop* — the composite FK
      // `products_section_id_vendor_id_fk` enforces it.
      const sectionId = seedId(Family.Section, vIndex * 100 + SECTION_NAMES.indexOf(item.sectionName));
      await db
        .insert(products)
        .values({
          id: productId,
          vendorId,
          categoryId: CATEGORY_IDS[item.categoryKey],
          sectionId,
          name: item.name,
          description: `${item.name} — sélection ${v.name}.`,
          priceCad: cents(item.priceCents),
          stockQty: intBetween(rand, 4, 90),
          isAvailable: true,
        })
        .onConflictDoUpdate({ target: products.id, set: { priceCad: cents(item.priceCents) } });
      list.push({ id: productId, name: item.name, priceCents: item.priceCents });
    }
    productsOf.set(v.key, list);
  }

  // 5 ─ couriers.
  const courierIdOf = new Map<string, string>();
  for (const [index, c] of COURIERS.entries()) {
    const courierId = seedId(Family.Courier, index);
    courierIdOf.set(c.key, courierId);
    const decided = c.status !== 'pending';
    await db
      .insert(couriers)
      .values({
        id: courierId,
        userId: id(`courier:${c.key}`),
        fullName: c.fullName,
        phone: c.phone,
        vehicle: c.vehicle,
        plate: c.plate ?? null,
        licenceNumber: c.licenceNumber ?? null,
        city: c.city,
        baseLat: c.lat,
        baseLng: c.lng,
        rating: (4.2 + rand() * 0.8).toFixed(1),
        deliveryCount: c.status === 'approved' ? intBetween(rand, 20, 400) : 0,
        status: c.status,
        statusReason: c.statusReason ?? null,
        reviewedBy: decided ? adminId : null,
        reviewedAt: decided ? new Date(now - intBetween(rand, 15, 180) * 86_400_000) : null,
        isOnline: c.isOnline,
        joinedAt: new Date(now - intBetween(rand, 60, 380) * 86_400_000),
      })
      .onConflictDoUpdate({ target: couriers.id, set: { status: c.status, isOnline: c.isOnline } });

    if (c.insurance) {
      await db
        .insert(courierInsurance)
        .values({ courierId, insurerName: c.insurance.insurerName, policyNumber: c.insurance.policyNumber, expiry: c.insurance.expiry })
        .onConflictDoNothing();
    }
  }

  // 6 ─ profile back-links, only now that both sides exist.
  for (const v of VENDORS) {
    await db.execute(sql`update profiles set vendor_id = ${vendorIdOf.get(v.key)!} where id = ${id(`vendor:${v.key}`)}`);
  }
  for (const c of COURIERS) {
    await db.execute(sql`update profiles set courier_id = ${courierIdOf.get(c.key)!} where id = ${id(`courier:${c.key}`)}`);
  }

  // 7 ─ customer addresses.
  for (const [index, c] of CUSTOMERS.entries()) {
    await db
      .insert(addresses)
      .values({
        id: seedId(Family.Address, index),
        profileId: id(`customer:${c.key}`),
        label: c.address.label,
        street: c.address.street,
        city: c.address.city,
        postalCode: c.address.postalCode,
        lat: c.address.lat,
        lng: c.address.lng,
        isDefault: true,
      })
      .onConflictDoNothing();
  }

  // 8 ─ orders, with items, history, delivery, and the occasional problem.
  //
  // Built entirely in memory first, then written in batches. `reset()` has
  // already emptied every seeded table, so these are plain inserts — the
  // per-order DELETEs the first version issued were redundant and cost two
  // extra round trips each.
  const approvedVendors = VENDORS.filter((v) => v.status === 'approved');
  const approvedCouriers = COURIERS.filter((c) => c.status === 'approved');

  const orderRows: (typeof orders.$inferInsert)[] = [];
  const itemRows: (typeof orderItems.$inferInsert)[] = [];
  const historyRows: (typeof orderStatusHistory.$inferInsert)[] = [];
  const deliveryRows: (typeof orderDeliveries.$inferInsert)[] = [];
  const issueRows: (typeof courierIssues.$inferInsert)[] = [];
  const disputeRows: (typeof disputes.$inferInsert)[] = [];

  let orderSeq = 0;

  for (const v of approvedVendors) {
    const vendorId = vendorIdOf.get(v.key)!;
    const catalogue = productsOf.get(v.key)!;
    const orderCount = intBetween(rand, 14, 33);

    for (let n = 0; n < orderCount; n += 1) {
      const index = orderSeq++;
      const orderId = seedId(Family.Order, index);
      const customer = pick(rand, CUSTOMERS);

      // The first few orders of each shop are deliberately live; the rest are
      // scattered across the whole window. See LIVE_ORDERS_PER_VENDOR.
      const live = n < LIVE_ORDERS_PER_VENDOR;
      const daysAgo = live ? rand() * 1.5 : rand() * DAYS_OF_HISTORY;
      const createdAt = new Date(now - daysAgo * 86_400_000);

      const status: OrderStatus = live
        ? pick(rand, IN_FLIGHT)
        : rand() < 0.08
          ? 'cancelled'
          : 'delivered';

      const lineCount = intBetween(rand, 1, 5);
      const lines = Array.from({ length: lineCount }, () => {
        const product = pick(rand, catalogue);
        return { product, qty: intBetween(rand, 1, 3) };
      });

      // All money in integer cents, so the parts sum exactly to the total.
      const subtotal = lines.reduce((sum, l) => sum + l.product.priceCents * l.qty, 0);
      const gst = Math.round(subtotal * GST_RATE);
      const qst = Math.round(subtotal * QST_RATE);
      const deliveryFee = intBetween(rand, 399, 799);
      const total = subtotal + gst + qst + deliveryFee;

      const refunded = status === 'delivered' && rand() < 0.1;

      orderRows.push({
        id: orderId,
        customerId: id(`customer:${customer.key}`),
        customerName: customer.fullName,
        vendorId,
        status,
        subtotalCad: cents(subtotal),
        gstCad: cents(gst),
        qstCad: cents(qst),
        deliveryFeeCad: cents(deliveryFee),
        totalCad: cents(total),
        deliveryAddressLabel: customer.address.label,
        deliveryAddressStreet: customer.address.street,
        deliveryAddressCity: customer.address.city,
        deliveryAddressPostalCode: customer.address.postalCode,
        deliveryAddressLat: customer.address.lat,
        deliveryAddressLng: customer.address.lng,
        refundedAt: refunded ? new Date(createdAt.getTime() + 2 * 86_400_000) : null,
        refundAmountCad: refunded ? cents(total) : null,
        refundReason: refunded ? 'Litige résolu en faveur du client.' : null,
        createdAt,
      });

      for (const [lineIndex, line] of lines.entries()) {
        itemRows.push({
          id: seedId(Family.OrderItem, index * 10 + lineIndex),
          orderId,
          productId: line.product.id,
          name: line.product.name,
          qty: line.qty,
          unitPriceCad: cents(line.product.priceCents),
        });
      }

      // A status is only credible with the trail that led to it.
      const trail: OrderStatus[] =
        status === 'cancelled'
          ? ['pending', 'confirmed', 'cancelled']
          : ORDER_FLOW.slice(0, ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]) + 1);

      for (const [stepIndex, step] of trail.entries()) {
        historyRows.push({
          id: seedId(Family.StatusEvent, index * 10 + stepIndex),
          orderId,
          status: step,
          at: new Date(createdAt.getTime() + stepIndex * 11 * 60_000),
        });
      }

      // A courier is assigned once the order leaves the shop. `ready` orders
      // deliberately get none — that is exactly what `ordersUnassigned`
      // counts, and it needs rows to count.
      const carried = status === 'delivered' || status === 'out_for_delivery';
      if (carried && approvedCouriers.length > 0) {
        const courier = pick(rand, approvedCouriers);
        const deliveredAt = status === 'delivered' ? new Date(createdAt.getTime() + 55 * 60_000) : null;
        deliveryRows.push({
          orderId,
          courierId: courierIdOf.get(courier.key)!,
          acceptedAt: new Date(createdAt.getTime() + 8 * 60_000),
          pickedUpAt: new Date(createdAt.getTime() + 26 * 60_000),
          deliveredAt,
          pickupEtaMin: intBetween(rand, 8, 20),
          dropoffEtaMin: intBetween(rand, 12, 35),
          distanceKm: (2 + rand() * 11).toFixed(2),
          pin: String(intBetween(rand, 1000, 9999)),
          tipCad: cents(rand() < 0.45 ? intBetween(rand, 100, 600) : 0),
          earningsCad: cents(intBetween(rand, 650, 1500)),
        });

        // ~7 % of runs hit a problem, mixed open and resolved.
        if (rand() < 0.07) {
          const reason = pick(rand, COURIER_ISSUE_REASONS);
          const resolved = rand() < 0.5;
          issueRows.push({
            orderId,
            reason,
            message: COURIER_ISSUE_MESSAGES[reason],
            status: resolved ? 'resolved' : 'open',
            at: new Date(createdAt.getTime() + 40 * 60_000),
            resolvedBy: resolved ? adminId : null,
            resolvedAt: resolved ? new Date(createdAt.getTime() + 3 * 3_600_000) : null,
          });
        }
      }

      // ~9 % of finished orders are disputed, spread across all four states.
      if ((status === 'delivered' || status === 'cancelled') && rand() < 0.09) {
        const reason = pick(rand, DISPUTE_REASONS);
        const state = pick(rand, ['open', 'answered', 'resolved', 'rejected'] as const);
        const settled = state === 'resolved' || state === 'rejected';
        disputeRows.push({
          orderId,
          reason,
          message: DISPUTE_MESSAGES[reason],
          status: state,
          openedAt: new Date(createdAt.getTime() + 4 * 3_600_000),
          merchantReply: state === 'open' ? null : 'Nous avons vérifié la préparation de cette commande.',
          answeredAt: state === 'open' ? null : new Date(createdAt.getTime() + 9 * 3_600_000),
          resolvedBy: settled ? adminId : null,
          resolvedAt: settled ? new Date(createdAt.getTime() + 30 * 3_600_000) : null,
        });
      }
    }
  }

  // Parents before children, so every foreign key resolves.
  await insertAll(orders, orderRows);
  await insertAll(orderItems, itemRows);
  await insertAll(orderStatusHistory, historyRows);
  await insertAll(orderDeliveries, deliveryRows);
  await insertAll(courierIssues, issueRows);
  await insertAll(disputes, disputeRows);

  const liveCount = orderRows.filter((o) => IN_FLIGHT.includes(o.status as (typeof IN_FLIGHT)[number])).length;


  console.log(`  shops    ${VENDORS.length} (${approvedVendors.length} approved, ${VENDORS.length - approvedVendors.length} in review)`);
  console.log(`  couriers ${COURIERS.length} (${approvedCouriers.length} approved)`);
  console.log(`  orders   ${orderRows.length} (${liveCount} still in flight)`);
  console.log(`  problems ${disputeRows.length} disputes, ${issueRows.length} courier issues`);
  console.log(`\n  Sign in to the dashboard as:\n    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

// ── entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\nSougouba dev seed');
  await assertSafe();
  console.log('');

  if (RESET_ONLY) {
    await reset();
    console.log('\n✓ Seeded rows removed.\n');
    return;
  }

  // Always reset first, so a re-run cannot accumulate rows from a changed
  // fixture list. Scoped to `5eed…` exactly as teardown is.
  await reset();
  await seed();
  console.log('\n✓ Seed complete.\n');
}

await main();
process.exit(0);
