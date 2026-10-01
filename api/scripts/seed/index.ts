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
import { createSeedDb } from './seed-db.js';
import { deleteSeedAuthUsers, ensureAuthUsers, type SeedPerson } from './auth-users.js';
import {
  COURIERS,
  COURIER_ISSUE_MESSAGES,
  COURIER_ISSUE_REASONS,
  CUSTOMERS,
  DISPUTE_MESSAGES,
  DISPUTE_REASONS,
  VENDORS,
  VENDOR_IMAGES,
} from './fixtures.js';
import { catalogueFor, productSeedIndex, sectionSeedIndex } from './catalogue.js';
import { productImagePath, vendorImagePath } from './image-paths.js';
import { Family, isSeedEmail, seedEmail, seedId, SEED_ID_PREFIX } from './ids.js';
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

const db = createSeedDb(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Multi-row insert, chunked.
 *
 * The old bind-parameter ceiling is gone — PostgREST takes a JSON array, not
 * 65,535 placeholders — but the chunking stays: the request body is still one
 * HTTP payload, and a few thousand rows in one POST is a timeout waiting to
 * happen. Empty arrays are skipped.
 */
async function insertAll(table: string, rows: Record<string, unknown>[]): Promise<void> {
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

  const host = new URL(SUPABASE_URL).hostname;
  console.log(`  target   ${host}`);
  console.log(`  mode     ${RESET_ONLY ? 'RESET (delete seeded rows)' : 'SEED'}`);

  if (!CONFIRMED) {
    console.error('\n✗ Refusing to touch the database without --yes.');
    console.error('  Re-run as: npm run db:seed -- --yes');
    process.exit(1);
  }

  // The guard the other three miss: a database that is real but not labelled
  // production. Counts rows this script could not have written.
  const [vendorCount, orderCount, courierCount] = await Promise.all([
    db.countNotMatching('vendors', 'id', SEED_ID_PREFIX),
    db.countNotMatching('orders', 'id', SEED_ID_PREFIX),
    db.countNotMatching('couriers', 'id', SEED_ID_PREFIX),
  ]);

  const total = vendorCount + orderCount + courierCount;
  if (total > 0 && !FORCE) {
    console.error(
      `\n✗ This database holds ${total} row(s) this script did not create ` +
        `(${vendorCount} vendors, ${orderCount} orders, ${courierCount} couriers).`
    );
    console.error('  That usually means SUPABASE_URL points somewhere real. Pass --force only if you are certain.');
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
  // One transaction, and one place where the `5eed…` scoping lives — see the
  // `rpc_seed_reset` migration. The previous version issued fifteen separate
  // statements and could fail halfway, leaving a half-deleted dataset with
  // dangling vendor and courier pointers on `profiles`.
  const { data, error } = await db.client.rpc('seed_reset', { p_prefix: SEED_ID_PREFIX });
  if (error) throw new Error(`seed reset: ${error.code ?? '?'} ${error.message}`);
  console.log(`  deleted  ${JSON.stringify(data)}`);

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
  await db.setOn('profiles', adminId, { role: 'admin' });
  for (const [index, person] of people.entries()) {
    const role = person.key.startsWith('vendor:') ? 'business' : person.key.startsWith('courier:') ? 'courier' : 'customer';
    // Spread joining dates across the past year — otherwise every account
    // reads as created today and "membre depuis" is useless on every screen.
    const memberSince = new Date(now - (30 + index * 17) * 86_400_000);
    // `::role` — the enum is named `role`, matching `roleEnum` in
    // `src/db/schema/identity.ts`. A bare string parameter has no type Postgres
    // can infer here, so the cast is required.
    // The enum cast the raw SQL needed is gone: PostgREST resolves the column
    // type itself, so a bare string is enough here.
    await db.setOn('profiles', id(person.key), { role, memberSince });
  }

  // 3 ─ shops.
  const vendorIdOf = new Map<string, string>();
  for (const [index, v] of VENDORS.entries()) {
    const vendorId = seedId(Family.Vendor, index);
    vendorIdOf.set(v.key, vendorId);
    const decided = v.status !== 'pending';
    await db
      .insert('vendors')
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
        // Paths only — the files are uploaded by `npm run db:seed:images`.
        logoUrl: vendorImagePath(vendorId, VENDOR_IMAGES[v.key]!),
        coverUrl: vendorImagePath(vendorId, VENDOR_IMAGES[v.key]!),
        isHalalCertified: v.categoryKeys.includes('viandeHalal'),
        ownerId: id(`vendor:${v.key}`),
        status: v.status,
        statusReason: v.statusReason ?? null,
        reviewedBy: decided ? adminId : null,
        reviewedAt: decided ? new Date(now - intBetween(rand, 20, 200) * 86_400_000) : null,
        createdAt: new Date(now - intBetween(rand, 200, 400) * 86_400_000),
      })
      .onConflictDoUpdate({ set: { name: v.name, status: v.status, statusReason: v.statusReason ?? null } });

    // A file under review needs the paperwork the reviewer is looking at.
    await db
      .insert('vendor_registrations')
      .values({
        vendorId,
        neq: `11${String(70000000 + index * 137).slice(0, 8)}`,
        contactName: v.ownerName,
        contactPhone: `+1514555${String(1000 + index).slice(-4)}`,
        mapaqNumber: v.vendorType === 'restaurant' ? `MAPAQ-${900000 + index}` : null,
      })
      .onConflictDoNothing();

    // The shop's own aisles (`catalogue.ts`), not one generic set for all.
    for (const [position, nameFr] of catalogueFor(v.key).sections.entries()) {
      await db
        .insert('vendor_sections')
        .values({ id: seedId(Family.Section, sectionSeedIndex(index, position)), vendorId, nameFr, position })
        .onConflictDoNothing();
    }

    for (let day = 0; day < 7; day += 1) {
      await db
        .insert('vendor_hours')
        .values({ vendorId, day, open: day === 0 ? '10:00' : '08:00', close: day === 0 ? '17:00' : '20:00', closed: false })
        .onConflictDoNothing();
    }

    // Listed under the categories its products are actually in.
    for (const categoryId of catalogueFor(v.key).categoryIds) {
      await db.insert('vendor_categories').values({ vendorId, categoryId }).onConflictDoNothing();
    }
  }

  // 4 ─ products. `order_items.product_id` is NOT NULL, so orders need these.
  const productsOf = new Map<string, { id: string; name: string; priceCents: number }[]>();
  for (const [vIndex, v] of VENDORS.entries()) {
    const vendorId = vendorIdOf.get(v.key)!;
    const list: { id: string; name: string; priceCents: number }[] = [];
    for (const [iIndex, item] of catalogueFor(v.key).products.entries()) {
      const productId = seedId(Family.Product, productSeedIndex(vIndex, iIndex));
      // A product must sit in an aisle *of its own shop* — the composite FK
      // `products_section_id_vendor_id_fk` enforces it.
      const sectionId = seedId(Family.Section, sectionSeedIndex(vIndex, item.section));
      await db
        .insert('products')
        .values({
          id: productId,
          vendorId,
          categoryId: item.categoryId,
          sectionId,
          name: item.name,
          description: item.description,
          priceCad: cents(item.priceCents),
          compareAtPriceCad: item.compareAtCents === null ? null : cents(item.compareAtCents),
          imageUrl: productImagePath(vendorId, item.image),
          stockQty: item.stockQty,
          isAvailable: item.isAvailable,
          tags: item.tags,
          nutritionCalories: item.nutrition?.calories ?? null,
          nutritionProteinG: item.nutrition?.proteinG ?? null,
          nutritionFatG: item.nutrition?.fatG ?? null,
          nutritionWeightG: item.nutrition?.weightG ?? null,
        })
        .onConflictDoUpdate({ set: { priceCad: cents(item.priceCents) } });
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
      .insert('couriers')
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
      .onConflictDoUpdate({ set: { status: c.status, isOnline: c.isOnline } });

    if (c.insurance) {
      await db
        .insert('courier_insurance')
        .values({ courierId, insurerName: c.insurance.insurerName, policyNumber: c.insurance.policyNumber, expiry: c.insurance.expiry })
        .onConflictDoNothing();
    }
  }

  // 6 ─ profile back-links, only now that both sides exist.
  for (const v of VENDORS) {
    await db.setOn('profiles', id(`vendor:${v.key}`), { vendorId: vendorIdOf.get(v.key)! });
  }
  for (const c of COURIERS) {
    await db.setOn('profiles', id(`courier:${c.key}`), { courierId: courierIdOf.get(c.key)! });
  }

  // 7 ─ customer addresses.
  for (const [index, c] of CUSTOMERS.entries()) {
    await db
      .insert('addresses')
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

  // Loosely typed now that the Drizzle row types are gone. The shape is
  // asserted by the database on insert instead — a wrong column name is a
  // PostgREST error naming it, which is a clearer failure than a type error
  // three files away.
  type Row = Record<string, unknown>;
  const orderRows: Row[] = [];
  const itemRows: Row[] = [];
  const historyRows: Row[] = [];
  const deliveryRows: Row[] = [];
  const issueRows: Row[] = [];
  const disputeRows: Row[] = [];

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
  await insertAll('orders', orderRows);
  await insertAll('order_items', itemRows);
  await insertAll('order_status_history', historyRows);
  await insertAll('order_deliveries', deliveryRows);
  await insertAll('courier_issues', issueRows);
  await insertAll('disputes', disputeRows);

  // 9 ─ the points those deliveries earned. Through the same function the API
  // calls on delivery, so the ledger is the one a real order would leave; the
  // first version wrote orders and never the points, and every seeded shopper
  // with sixty days of history had a balance of 0.
  const deliveredAtOf = new Map(deliveryRows.map((d) => [d.orderId as string, d.deliveredAt as Date | null]));
  const settings = (await db.client.from('platform_settings').select('*').eq('id', 1).single()).data as Record<string, unknown>;
  let credited = 0;
  for (const o of orderRows) {
    if (o.status !== 'delivered' || o.refundedAt) continue;
    const deliveredAt = deliveredAtOf.get(o.id as string) ?? new Date((o.createdAt as Date).getTime() + 55 * 60_000);
    const expiresAt = new Date(deliveredAt);
    expiresAt.setMonth(expiresAt.getMonth() + Number(settings.points_expiry_months));
    const { error } = await db.client.rpc('loyalty_credit_delivered', {
      p_order_id: o.id,
      p_customer_id: o.customerId,
      p_points: Math.floor(Number(o.subtotalCad) * Number(settings.points_per_cad)),
      p_expires_at: expiresAt.toISOString(),
      p_created_at: deliveredAt.toISOString(),
      p_referral_points: Number(settings.referral_reward_points),
      p_qualifies_for_referral: false,
    });
    if (error) throw new Error(`loyalty credit: ${error.code ?? '?'} ${error.message}`);
    credited += 1;
  }

  const liveCount = orderRows.filter((o) => IN_FLIGHT.includes(o.status as (typeof IN_FLIGHT)[number])).length;


  console.log(`  shops    ${VENDORS.length} (${approvedVendors.length} approved, ${VENDORS.length - approvedVendors.length} in review)`);
  console.log(`  couriers ${COURIERS.length} (${approvedCouriers.length} approved)`);
  console.log(`  orders   ${orderRows.length} (${liveCount} still in flight)`);
  console.log(`  problems ${disputeRows.length} disputes, ${issueRows.length} courier issues`);
  console.log(`  loyalty  ${credited} delivered orders credited`);
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
