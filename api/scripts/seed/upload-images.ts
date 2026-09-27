/**
 * Uploads the seeded catalogue's photos and points the seeded rows at them.
 *
 *   npm run db:seed:images
 *
 * The files come from the app's own `assets/images/catalog/` (this repository's
 * root) — the same photos the mobile prototype bundled, with their credits in
 * `assets/images/CREDITS.md`. Each is uploaded into its shop's folder in the
 * public `product-media` / `vendor-media` buckets (see `image-paths.ts`).
 *
 * Safe to re-run: uploads upsert, and a row is only written when its image is
 * still empty — so a photo a merchant has since replaced is never overwritten.
 * Touches seeded ids (`5eed…`) only.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { ITEM_BANK, ITEM_IMAGES, VENDORS, VENDOR_IMAGES } from './fixtures.js';
import { Family, seedId } from './ids.js';
import { productImagePath, vendorImagePath } from './image-paths.js';

const CATALOG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../assets/images/catalog');
const PARALLEL = 8;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Run through `npm run db:seed:images`.');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
  console.error('✗ Refusing to run with NODE_ENV=production.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Job = { path: string; file: string; table: 'products' | 'vendors'; id: string };
const jobs: Job[] = [];
for (const [vIndex, v] of VENDORS.entries()) {
  const vendorId = seedId(Family.Vendor, vIndex);
  const vendorFile = VENDOR_IMAGES[v.key];
  if (!vendorFile) throw new Error(`No image for shop "${v.key}" in VENDOR_IMAGES`);
  jobs.push({ path: vendorImagePath(vendorId, vendorFile), file: vendorFile, table: 'vendors', id: vendorId });
  for (const [iIndex, item] of ITEM_BANK.entries()) {
    const file = ITEM_IMAGES[item.name];
    if (!file) throw new Error(`No image for "${item.name}" in ITEM_IMAGES`);
    const productId = seedId(Family.Product, vIndex * 100 + iIndex);
    jobs.push({ path: productImagePath(vendorId, file), file, table: 'products', id: productId });
  }
}

// Read every file before touching anything, so a missing one fails the run
// before half the catalogue has been written.
const bytes = new Map<string, Buffer>();
for (const job of jobs) {
  if (!bytes.has(job.file)) bytes.set(job.file, readFileSync(`${CATALOG_DIR}/${job.file}.jpg`));
}

let uploaded = 0;
let rows = 0;
async function run(job: Job) {
  const slash = job.path.indexOf('/');
  const bucket = job.path.slice(0, slash);
  const object = job.path.slice(slash + 1);
  const { error } = await db.storage
    .from(bucket)
    .upload(object, bytes.get(job.file)!, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
  if (error) throw new Error(`${job.path}: ${error.message}`);
  uploaded++;

  const update =
    job.table === 'products'
      ? db.from('products').update({ image_url: job.path }).eq('id', job.id).or('image_url.is.null,image_url.eq.')
      : db
          .from('vendors')
          .update({ logo_url: job.path, cover_url: job.path })
          .eq('id', job.id)
          .or('cover_url.is.null,cover_url.eq.');
  const { data, error: writeError } = await update.select('id');
  if (writeError) throw new Error(`${job.table} ${job.id}: ${writeError.message}`);
  rows += data?.length ?? 0;
}

for (let i = 0; i < jobs.length; i += PARALLEL) {
  await Promise.all(jobs.slice(i, i + PARALLEL).map(run));
}
console.log(`✓ ${uploaded} files uploaded (${bytes.size} distinct photos), ${rows} rows pointed at them.`);
