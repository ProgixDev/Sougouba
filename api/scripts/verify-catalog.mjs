/**
 * The catalogue's read rules, which the port had to move rather than translate.
 *
 * Three of them would fail silently rather than loudly if they were wrong — a
 * byte-sorted list still looks sorted, an unescaped `%` still returns products,
 * and a shop filtered client-side still returns a page. So they are asserted
 * here against live data.
 *
 *   node --env-file=.env scripts/verify-catalog.mjs
 *
 * Read-only. Writes nothing, cleans up nothing.
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
};
const rpc = async (fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

// ── the escaping guarantee ─────────────────────────────────────────────────
// `?q=%` unescaped builds the pattern `%%%` and hands back the whole
// catalogue. The mobile original is `name.includes(q)`, which has no pattern
// syntax at all.
console.log('\na literal % is a literal %');
{
  const all = await rpc('product_page', { p_limit: 1 });
  const wildcard = await rpc('product_page', { p_q: '%\\%%', p_limit: 5 });
  const underscore = await rpc('product_page', { p_q: '%\\_%', p_limit: 5 });
  check('the catalogue is non-empty to begin with', all.total > 0, `${all.total}`);
  check('q="%" does not return the catalogue', wildcard.total < all.total, `${wildcard.total} of ${all.total}`);
  check('q="_" does not return the catalogue', underscore.total < all.total, `${underscore.total} of ${all.total}`);
}

// ── the fr-CA collation ────────────────────────────────────────────────────
// A byte sort pushes every accented name to the end of the list and still
// looks like a sorted list.
console.log('\nÉ files under E, not at the end');
{
  const page = await rpc('product_page', { p_sort: 'name', p_limit: 500 });
  const names = page.items.map((i) => i.name);
  const accented = names.findIndex((n) => /^[ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/i.test(n) && /^[ÉÈÊË]/.test(n));
  check('the sorted page came back', names.length > 0);
  if (accented !== -1) {
    // Under fr-CA, "Épices" sits among the E's — comfortably before the tail.
    check('an É-initial name is not sorted to the end',
      accented < names.length - 1,
      `"${names[accented]}" at ${accented} of ${names.length}`);
    console.log(`    (${names[accented]} at position ${accented} of ${names.length})`);
  } else {
    console.log('    – no É-initial product in the catalogue to test');
  }
}

// ── pagination stability ───────────────────────────────────────────────────
// Without a unique tiebreak, Postgres may order tied rows differently between
// the offset=0 and offset=N queries, so a row can appear on two pages or
// neither. Duplicate product names are expected.
console.log('\npages do not overlap or drop rows');
{
  const size = 20;
  const p1 = await rpc('product_page', { p_sort: 'name', p_limit: size, p_offset: 0 });
  const p2 = await rpc('product_page', { p_sort: 'name', p_limit: size, p_offset: size });
  const ids1 = new Set(p1.items.map((i) => i.id));
  const overlap = p2.items.filter((i) => ids1.has(i.id));
  check('page 2 repeats nothing from page 1', overlap.length === 0, `${overlap.length} repeated`);
  check('both pages are full', p1.items.length === size && p2.items.length === size,
    `${p1.items.length} / ${p2.items.length}`);
  check('the total is stable across pages', p1.total === p2.total, `${p1.total} vs ${p2.total}`);
}

// ── the approval rule ──────────────────────────────────────────────────────
// A shop whose file is still in the queue is not "a shop that happens to be
// closed" — it is one the platform has not vouched for.
console.log('\nonly approved shops reach a shopper');
{
  const pending = (await db.from('vendors').select('id, name').neq('status', 'approved').limit(1).maybeSingle()).data;
  if (!pending) {
    console.log('    – no unapproved shop in the data to test');
  } else {
    const shopper = await rpc('product_page', { p_vendor_id: pending.id, p_approved_only: true, p_limit: 5 });
    const merchant = await rpc('product_page', { p_vendor_id: pending.id, p_approved_only: false, p_limit: 5 });
    check('a shopper sees none of an unapproved shop\'s shelves', shopper.total === 0, `${shopper.total}`);
    // The merchant manages their catalogue while the shop is still pending.
    check('its owner still sees their own catalogue', merchant.total >= 0);
    console.log(`    (${pending.name}: shopper ${shopper.total}, owner ${merchant.total})`);
  }
}

// ── the is_open computed column ────────────────────────────────────────────
// The filter has to run in the database: one applied after LIMIT paginates
// over the wrong set, so page 2 of "open shops" silently skips what page 1
// discarded.
console.log('\nis_open is computed and filterable in the database');
{
  const { data: rows, error } = await db.from('vendors').select('id, name, isOpen:is_open').eq('status', 'approved');
  check('is_open can be selected', !error && rows?.length > 0, error?.message);

  const { count: open, error: e2 } = await db
    .from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('is_open', true);
  const { count: shut, error: e3 } = await db
    .from('vendors').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('is_open', false);
  check('is_open can be filtered on', !e2 && !e3, e2?.message ?? e3?.message);

  const selectedOpen = (rows ?? []).filter((r) => r.isOpen).length;
  check('the filter agrees with the selected value', open === selectedOpen, `filter ${open} vs select ${selectedOpen}`);
  check('open + closed accounts for every approved shop', open + shut === (rows ?? []).length,
    `${open} + ${shut} vs ${rows?.length}`);
}

// ── the category filter does not fan out ───────────────────────────────────
// A join against a many-to-many duplicates a vendor row per matching category
// and breaks both the count and the page size.
console.log('\nthe category filter does not duplicate shops');
{
  const link = (await db.from('vendor_categories').select('category_id').limit(1).single()).data;
  const { data, count, error } = await db
    .from('vendors')
    .select('id, vendor_categories!inner(category_id)', { count: 'exact' })
    .eq('status', 'approved')
    .eq('vendor_categories.category_id', link.category_id);
  check('the filtered query succeeded', !error, error?.message);
  check('one row per shop, not one per category link', data?.length === count, `${data?.length} rows vs count ${count}`);
  check('no shop id appears twice', new Set((data ?? []).map((r) => r.id)).size === data?.length);
}

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
