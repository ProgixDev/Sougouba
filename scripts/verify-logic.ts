/**
 * Runtime checks for the pure logic the screens depend on.
 *
 * These are the parts where a type-check proves nothing: a schema that accepts
 * a blank price, or an aggregation that counts cancelled revenue, compiles
 * perfectly and is still wrong. Run with `npm run verify:logic`.
 */
import { products as seedProducts } from '../data/seed/products';
import { orders as seedOrders } from '../data/seed/orders';
import { summariseOrders } from '../lib/analytics';
import { advanceActionLabel, isActiveStatus, nextStatus } from '../lib/orderStatus';
import {
  activeFilterCount,
  applyFilters,
  emptyFilters,
  hasActiveFilters,
} from '../lib/productFilters';
import { parseTags, productSchema } from '../lib/validation/product';

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (!condition) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── product schema ───────────────────────────────────────────────────────────
const base = {
  name: 'Riz brisé',
  description: 'Riz brisé parfumé, sac de 5 kg.',
  categoryId: 'cat_grains',
  priceCad: '12.99',
  compareAtPriceCad: '',
  stockQty: '40',
  isAvailable: true,
  tags: 'bio, frais',
  calories: '360',
  proteinG: '7',
  fatG: '1',
  weightG: '5000',
};

const ok = productSchema.safeParse(base);
check('valid product parses', ok.success, ok.success ? '' : JSON.stringify(ok.error.issues));
if (ok.success) {
  check('price coerced to number', ok.data.priceCad === 12.99, String(ok.data.priceCad));
  check('blank compareAt → undefined', ok.data.compareAtPriceCad === undefined);
  check('stock coerced', ok.data.stockQty === 40);
}

const comma = productSchema.safeParse({ ...base, priceCad: '4,50' });
check('French decimal comma accepted', comma.success && comma.data.priceCad === 4.5);

check('blank price rejected', !productSchema.safeParse({ ...base, priceCad: '' }).success);
check('zero price rejected', !productSchema.safeParse({ ...base, priceCad: '0' }).success);
check('zero stock allowed', productSchema.safeParse({ ...base, stockQty: '0' }).success);
check('non-numeric price rejected', !productSchema.safeParse({ ...base, priceCad: 'abc' }).success);
check(
  'compareAt below price rejected',
  !productSchema.safeParse({ ...base, compareAtPriceCad: '9.99' }).success
);
check(
  'compareAt above price accepted',
  productSchema.safeParse({ ...base, compareAtPriceCad: '15.99' }).success
);
check('short description rejected', !productSchema.safeParse({ ...base, description: 'court' }).success);
check('missing category rejected', !productSchema.safeParse({ ...base, categoryId: '' }).success);

check('tags parsed + deduped', JSON.stringify(parseTags(' Bio , frais,bio, ')) === '["bio","frais"]',
  JSON.stringify(parseTags(' Bio , frais,bio, ')));

// ── order status transitions ─────────────────────────────────────────────────
check('pending advances to confirmed', nextStatus('pending') === 'confirmed');
check('delivered is terminal', nextStatus('delivered') === null);
check('cancelled is off the happy path', nextStatus('cancelled') === null);
check('delivered has no advance label', advanceActionLabel('delivered') === null);
check('pending has an advance label', Boolean(advanceActionLabel('pending')));
check('delivered is not active', !isActiveStatus('delivered'));
check('cancelled is not active', !isActiveStatus('cancelled'));
check('preparing is active', isActiveStatus('preparing'));

// ── analytics aggregation ────────────────────────────────────────────────────
// `NOW` is the real clock and the cutoff is derived the way summariseOrders
// derives it. Both used to be fixed strings, which only agreed with the seed on
// the day they were written — and the cutoff was parsed as UTC midnight, four
// hours before the local midnight the range actually starts at, so any order
// placed in that gap was counted on one side of the assertion only.
const NOW = new Date();
const rangeStart = new Date(NOW);
rangeStart.setHours(0, 0, 0, 0);
rangeStart.setDate(rangeStart.getDate() - 29);

const tanit = seedOrders.filter((o) => o.vendorId === 'vnd_boulangerie_tanit');
const s30 = summariseOrders(tanit, 30, NOW);

check('30 buckets for a 30-day range', s30.buckets.length === 30, String(s30.buckets.length));
check(
  'revenue equals sum of non-cancelled in range',
  Math.abs(
    s30.revenueCad -
      tanit
        .filter((o) => o.status !== 'cancelled' && new Date(o.createdAt) >= rangeStart)
        .reduce((sum, o) => sum + o.totalCad, 0)
  ) < 0.01,
  String(s30.revenueCad)
);
// The seed is dated relative to launch, so a shop always has recent trade. A
// zero here means the generator stopped producing, not that the maths is wrong.
check('the range has revenue to aggregate', s30.revenueCad > 0, String(s30.revenueCad));
check(
  'bucket revenue sums to total',
  Math.abs(s30.buckets.reduce((sum, b) => sum + b.revenueCad, 0) - s30.revenueCad) < 0.01
);
check(
  'avg basket = revenue / orders',
  s30.orderCount === 0 || Math.abs(s30.avgBasketCad - s30.revenueCad / s30.orderCount) < 0.01
);

// Cancelled money must never appear in revenue, but must appear in the mix.
const adjoa = seedOrders.filter((o) => o.vendorId === 'vnd_mama_adjoa');
const sAdjoa = summariseOrders(adjoa, 60, NOW);
const cancelledTotal = adjoa
  .filter((o) => o.status === 'cancelled')
  .reduce((sum, o) => sum + o.totalCad, 0);
check('there is a cancelled order to test with', cancelledTotal > 0);
check(
  'cancelled revenue excluded',
  Math.abs(
    sAdjoa.revenueCad -
      adjoa.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalCad, 0)
  ) < 0.01
);
check('cancelled still counted in statusCounts', (sAdjoa.statusCounts.cancelled ?? 0) > 0);
check('orderCount excludes cancelled', sAdjoa.orderCount === adjoa.filter((o) => o.status !== 'cancelled').length);
check('top products sorted by qty desc', sAdjoa.topProducts.every((p, i, arr) => i === 0 || arr[i - 1].qty >= p.qty));

// Empty range must not divide by zero.
const empty = summariseOrders([], 7, NOW);
check('empty range → zero avg basket, no NaN', empty.avgBasketCad === 0 && !Number.isNaN(empty.avgBasketCad));
check('empty range still yields buckets', empty.buckets.length === 7);

// ── search filters ───────────────────────────────────────────────────────────
// The bands are half-open (min inclusive, max exclusive) so a $10.00 product
// lands in exactly one of "moins de 10 $" and "10 $ à 20 $", never both or
// neither. That boundary is the whole reason this section exists.
check('no filters returns everything', applyFilters(seedProducts, emptyFilters).length === seedProducts.length);
check('no filters is not "active"', activeFilterCount(emptyFilters) === 0 && !hasActiveFilters(emptyFilters));
check('sort alone does not count as a filter', activeFilterCount({ ...emptyFilters, sort: 'price_asc' }) === 0);
check('sort alone still counts as "has active"', hasActiveFilters({ ...emptyFilters, sort: 'price_asc' }));

const under10 = applyFilters(seedProducts, { ...emptyFilters, priceBand: 'under_10' });
const mid = applyFilters(seedProducts, { ...emptyFilters, priceBand: '10_to_20' });
const over20 = applyFilters(seedProducts, { ...emptyFilters, priceBand: 'over_20' });
check('price bands partition the catalogue', under10.length + mid.length + over20.length === seedProducts.length);
check('bands do not overlap', new Set([...under10, ...mid, ...over20].map((p) => p.id)).size === seedProducts.length);
check('under 10 holds only sub-$10', under10.every((p) => p.priceCad < 10));
check('10–20 is min-inclusive, max-exclusive', mid.every((p) => p.priceCad >= 10 && p.priceCad < 20));
check('over 20 holds only $20 and up', over20.every((p) => p.priceCad >= 20));

const onSale = applyFilters(seedProducts, { ...emptyFilters, onSale: true });
check('there are discounted products to test with', onSale.length > 0);
check('on-sale keeps only struck-through prices', onSale.every((p) => Boolean(p.compareAtPriceCad)));

const inStock = applyFilters(seedProducts, { ...emptyFilters, inStockOnly: true });
check('there is an unavailable product to exclude', inStock.length < seedProducts.length);
check('in-stock excludes unavailable and zero-qty', inStock.every((p) => p.isAvailable && p.stockQty > 0));

const oneVendor = applyFilters(seedProducts, { ...emptyFilters, vendorId: 'vnd_teranga' });
check('vendor filter narrows to that shop', oneVendor.length > 0 && oneVendor.every((p) => p.vendorId === 'vnd_teranga'));

const asc = applyFilters(seedProducts, { ...emptyFilters, sort: 'price_asc' });
const desc = applyFilters(seedProducts, { ...emptyFilters, sort: 'price_desc' });
check('price ascending is ordered', asc.every((p, i, a) => i === 0 || a[i - 1].priceCad <= p.priceCad));
check('price descending is ordered', desc.every((p, i, a) => i === 0 || a[i - 1].priceCad >= p.priceCad));
check('sorting does not drop products', asc.length === seedProducts.length && desc.length === seedProducts.length);
check(
  'relevance preserves incoming order',
  applyFilters(seedProducts, emptyFilters).every((p, i) => p.id === seedProducts[i].id)
);
// Sorting must copy: the catalogue array is shared with every other screen.
const orderBeforeSort = seedProducts.map((p) => p.id);
applyFilters(seedProducts, { ...emptyFilters, sort: 'price_asc' });
check('sorting does not mutate the catalogue', seedProducts.every((p, i) => p.id === orderBeforeSort[i]));

// Combined filters must intersect, not accumulate.
const combined = applyFilters(seedProducts, {
  ...emptyFilters,
  vendorId: 'vnd_teranga',
  inStockOnly: true,
});
check(
  'combined filters intersect',
  combined.every((p) => p.vendorId === 'vnd_teranga' && p.isAvailable && p.stockQty > 0)
);
check('every filter set counts once', activeFilterCount({ sort: 'name', priceBand: 'under_10', vendorId: 'vnd_teranga', onSale: true, inStockOnly: true }) === 4);

console.log(failures === 0 ? '\nALL LOGIC CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
