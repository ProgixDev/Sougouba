/**
 * Puts each seeded shop's own shelves (`catalogue.ts`) onto a database that
 * was seeded with the old generic list — **in place**, without the reset a full
 * `db:seed` begins with.
 *
 * Run:  npm run db:seed:catalogue -- --yes
 *
 * Why not just re-seed: `db:seed` deletes every seeded account and recreates it
 * under a new id, which signs every test phone out and takes with it anything
 * created against the seeded shops since (orders, addresses, favourites). This
 * touches only `5eed…` rows and leaves everything else exactly as it is.
 *
 * What it does, per shop:
 *   1. writes the shop's aisles and products (product ids are kept, so order
 *      lines and favourites pointing at them stay valid);
 *   2. re-points every *seeded* order line at the shop's real products and
 *      re-totals those orders — a restaurant's history should list dishes;
 *   3. retires the generic products and aisles nothing references any more;
 *   4. lists the shop under the categories its products are actually in.
 * Then, across all shops:
 *   5. credits the loyalty points every seeded delivered order should have
 *      earned (the seed wrote orders, never the points), through the same
 *      `loyalty_credit_delivered` the API calls — idempotent per order;
 *   6. uploads the product photos to Storage.
 *
 * Re-runnable: every write is an upsert keyed on a seeded id, or idempotent.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { catalogueFor, productSeedIndex, sectionSeedIndex } from './catalogue.js';
import { VENDORS } from './fixtures.js';
import { Family, seedId } from './ids.js';
import { productImagePath } from './image-paths.js';
import { hashString } from './rng.js';

const CATALOG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../assets/images/catalog');
/** The old seed gave every shop fifteen products at indices 0–14 and seven aisles at 0–6. */
const OLD_PRODUCT_SLOTS = 15;
const OLD_SECTION_SLOTS = 7;
/** Every `5eed…` uuid, as a range — PostgREST cannot LIKE a uuid column. */
const SEED_LOW = '5eed0000-0000-0000-0000-000000000000';
const SEED_HIGH = '5eee0000-0000-0000-0000-000000000000';
const GST_RATE = 0.05;
const QST_RATE = 0.09975;

if (process.env.NODE_ENV === 'production') {
  console.error('✗ Refusing to run with NODE_ENV=production.');
  process.exit(1);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Run through `npm run db:seed:catalogue`.');
  process.exit(1);
}
console.log(`\nSougouba catalogue\n  target   ${new URL(url).hostname}`);
if (!process.argv.includes('--yes')) {
  console.error('\n✗ Refusing to touch the database without --yes.\n  Re-run as: npm run db:seed:catalogue -- --yes');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function must<T>(
  label: string,
  query: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.code ?? '?'} ${error.message}`);
  return data as T;
}

const cents = (c: number) => (c / 100).toFixed(2);
const toCents = (v: unknown) => Math.round(Number(v) * 100);

type Row = Record<string, any>;
const uploads = new Map<string, string>(); // storage path → image file
let productsWritten = 0;
let linesRepointed = 0;
let ordersRetotalled = 0;
let productsRetired = 0;
const productsKept: string[] = [];

for (const [vIndex, v] of VENDORS.entries()) {
  const vendorId = seedId(Family.Vendor, vIndex);
  const exists = await must('vendor', db.from('vendors').select('id').eq('id', vendorId).maybeSingle());
  if (!exists) {
    console.log(`  skip     ${v.name} (not in this database)`);
    continue;
  }
  const cat = catalogueFor(v.key);

  // 1 ─ aisles, then products into them.
  await must(
    'sections',
    db.from('vendor_sections').upsert(
      cat.sections.map((nameFr, position) => ({
        id: seedId(Family.Section, sectionSeedIndex(vIndex, position)),
        vendor_id: vendorId,
        name_fr: nameFr,
        position,
      }))
    )
  );

  const productIds = cat.products.map((_, i) => seedId(Family.Product, productSeedIndex(vIndex, i)));
  await must(
    'products',
    db.from('products').upsert(
      cat.products.map((p, i) => ({
        id: productIds[i],
        vendor_id: vendorId,
        category_id: p.categoryId,
        section_id: seedId(Family.Section, sectionSeedIndex(vIndex, p.section)),
        name: p.name,
        description: p.description,
        price_cad: cents(p.priceCents),
        compare_at_price_cad: p.compareAtCents === null ? null : cents(p.compareAtCents),
        image_url: productImagePath(vendorId, p.image),
        stock_qty: p.stockQty,
        is_available: p.isAvailable,
        tags: p.tags,
        nutrition_calories: p.nutrition?.calories ?? null,
        nutrition_protein_g: p.nutrition?.proteinG ?? null,
        nutrition_fat_g: p.nutrition?.fatG ?? null,
        nutrition_weight_g: p.nutrition?.weightG ?? null,
      }))
    )
  );
  productsWritten += cat.products.length;
  for (const p of cat.products) uploads.set(productImagePath(vendorId, p.image), p.image);

  // 2 ─ seeded orders: re-point each line at a real product of this shop, re-total.
  const orders = await must<Row[]>(
    'orders',
    db.from('orders').select('*').eq('vendor_id', vendorId).gte('id', SEED_LOW).lt('id', SEED_HIGH)
  );
  if (orders.length > 0) {
    const items = await must<Row[]>(
      'order items',
      db.from('order_items').select('*').in('order_id', orders.map((o) => o.id))
    );
    const subtotalOf = new Map<string, number>();
    const repointed = items.map((item) => {
      // Stable per line, so a re-run picks the same product again.
      const product = cat.products[hashString(item.id) % cat.products.length]!;
      const productId = productIds[cat.products.indexOf(product)]!;
      subtotalOf.set(item.order_id, (subtotalOf.get(item.order_id) ?? 0) + product.priceCents * item.qty);
      return { ...item, product_id: productId, name: product.name, unit_price_cad: cents(product.priceCents) };
    });
    await must('order items', db.from('order_items').upsert(repointed));
    linesRepointed += repointed.length;

    const retotalled = orders.map((o) => {
      const subtotal = subtotalOf.get(o.id) ?? toCents(o.subtotal_cad);
      const gst = Math.round(subtotal * GST_RATE);
      const qst = Math.round(subtotal * QST_RATE);
      const total = subtotal + gst + qst + toCents(o.delivery_fee_cad);
      return {
        ...o,
        subtotal_cad: cents(subtotal),
        gst_cad: cents(gst),
        qst_cad: cents(qst),
        total_cad: cents(total),
        refund_amount_cad: o.refunded_at ? cents(total) : o.refund_amount_cad,
      };
    });
    await must('orders', db.from('orders').upsert(retotalled));
    ordersRetotalled += retotalled.length;
  }

  // 3 ─ retire the generic products and aisles nothing points at any more.
  const oldIds = Array.from({ length: OLD_PRODUCT_SLOTS }, (_, i) => seedId(Family.Product, productSeedIndex(vIndex, i))).filter(
    (id) => !productIds.includes(id)
  );
  if (oldIds.length > 0) {
    const referenced = new Set(
      (await must<Row[]>('references', db.from('order_items').select('product_id').in('product_id', oldIds))).map((r) => r.product_id)
    );
    const free = oldIds.filter((id) => !referenced.has(id));
    if (free.length > 0) {
      await must('favourites', db.from('favorite_products').delete().in('product_id', free));
      await must('retire products', db.from('products').delete().in('id', free));
      productsRetired += free.length;
    }
    // Still on someone's real order — kept, but off the shelf.
    const kept = oldIds.filter((id) => referenced.has(id));
    if (kept.length > 0) {
      await must('unlist products', db.from('products').update({ is_available: false, stock_qty: 0 }).in('id', kept));
      productsKept.push(...kept);
    }
  }
  const oldSections = Array.from({ length: OLD_SECTION_SLOTS }, (_, i) => seedId(Family.Section, vIndex * 100 + i));
  const usedSections = new Set(
    (await must<Row[]>('aisle use', db.from('products').select('section_id').in('section_id', oldSections))).map((r) => r.section_id)
  );
  const freeSections = oldSections.filter((id) => !usedSections.has(id));
  if (freeSections.length > 0) await must('retire aisles', db.from('vendor_sections').delete().in('id', freeSections));

  // 4 ─ the categories the shop is actually listed under.
  await must('categories', db.from('vendor_categories').delete().eq('vendor_id', vendorId));
  await must(
    'categories',
    db.from('vendor_categories').insert(cat.categoryIds.map((categoryId) => ({ vendor_id: vendorId, category_id: categoryId })))
  );

  console.log(`  shelves  ${v.name.padEnd(22)} ${cat.sections.length} aisles, ${cat.products.length} products, ${orders.length} orders re-totalled`);
}

// 5 ─ the points the seeded deliveries should have earned.
const settings = await must<Row>('settings', db.from('platform_settings').select('*').eq('id', 1).single());
const pointsPerCad = Number(settings.points_per_cad);
const expiryMonths = Number(settings.points_expiry_months);

const delivered = await must<Row[]>(
  'delivered',
  db
    .from('orders')
    .select('id, customer_id, subtotal_cad, created_at, order_deliveries(delivered_at)')
    .gte('id', SEED_LOW).lt('id', SEED_HIGH)
    .eq('status', 'delivered')
    .is('refunded_at', null)
);
let credited = 0;
for (const o of delivered) {
  const delivery = Array.isArray(o.order_deliveries) ? o.order_deliveries[0] : o.order_deliveries;
  const deliveredAt = new Date(delivery?.delivered_at ?? Date.parse(o.created_at) + 55 * 60_000);
  const expiresAt = new Date(deliveredAt);
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);
  const outcome = await must<string>(
    'loyalty',
    db.rpc('loyalty_credit_delivered', {
      p_order_id: o.id,
      p_customer_id: o.customer_id,
      p_points: Math.floor(Number(o.subtotal_cad) * pointsPerCad),
      p_expires_at: expiresAt.toISOString(),
      p_created_at: deliveredAt.toISOString(),
      p_referral_points: Number(settings.referral_reward_points),
      // Seeded customers were not referred by anyone; nothing to pay out.
      p_qualifies_for_referral: false,
    })
  );
  if (outcome !== 'duplicate') credited += 1;
}

// 6 ─ photos.
let uploaded = 0;
const jobs = [...uploads.entries()];
for (let i = 0; i < jobs.length; i += 8) {
  await Promise.all(
    jobs.slice(i, i + 8).map(async ([path, file]) => {
      const slash = path.indexOf('/');
      const { error } = await db.storage
        .from(path.slice(0, slash))
        .upload(path.slice(slash + 1), readFileSync(`${CATALOG_DIR}/${file}.jpg`), { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(`upload ${path}: ${error.message}`);
      uploaded += 1;
    })
  );
}

console.log(`\n  products ${productsWritten} written, ${productsRetired} generic ones retired`);
if (productsKept.length > 0) console.log(`  kept     ${productsKept.length} generic product(s) unlisted — still on a real order`);
console.log(`  orders   ${linesRepointed} lines re-pointed, ${ordersRetotalled} orders re-totalled`);
console.log(`  loyalty  ${delivered.length} delivered orders checked, ${credited} credited`);
console.log(`  photos   ${uploaded} uploaded`);
console.log('\n✓ Catalogue applied.\n');
process.exit(0);
