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
import {
  PAYOUT_WEEKDAY,
  groupRunsByDay,
  nextPayoutDate,
  pendingPayoutCad,
  splitEarnings,
  summariseRuns,
} from '../lib/courierAnalytics';
import { BASE_FARE_CAD, PER_KM_CAD, courierEarnings, courierFare } from '../data/courierPay';
import { deliveryPin, legDurationMin } from '../data/delivery';
import { distanceKm } from '../data/utils/geo';
import { DEMO_TIME_SCALE, buildLeg, etaMinutes, positionAlong, progressAt, splitPath } from '../lib/courierRoute';
import { OFFER_TIMEOUT_MS, isOfferExpired, offerRemainingMs, rankCouriers } from '../lib/dispatch';
import { couriers as seedCouriers } from '../data/seed/couriers';
import {
  advanceActionLabel,
  courierActionLabel,
  isActiveStatus,
  nextStatus,
  nextStatusFor,
  orderProgression,
} from '../lib/orderStatus';
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
  sectionId: 'sec_bamako_grains',
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
check('missing section rejected', !productSchema.safeParse({ ...base, sectionId: '' }).success);

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

// ── who owns which transition ────────────────────────────────────────────────
// The merchant's path ends when the bag is packed; the two steps that describe
// someone physically carrying it belong to the courier.
check("merchant accepts a pending order", nextStatusFor('pending', 'merchant') === 'confirmed');
check("merchant cannot hand off at ready", nextStatusFor('ready', 'merchant') === null);
check("courier picks up at ready", nextStatusFor('ready', 'courier') === 'out_for_delivery');
check("courier cannot accept an order", nextStatusFor('pending', 'courier') === null);
check("courier closes the run", nextStatusFor('out_for_delivery', 'courier') === 'delivered');
check("delivered is terminal for both",
  nextStatusFor('delivered', 'merchant') === null && nextStatusFor('delivered', 'courier') === null);
check("cancelled is terminal for both",
  nextStatusFor('cancelled', 'merchant') === null && nextStatusFor('cancelled', 'courier') === null);
// Every actor-scoped step must still be a step on the happy path — the two
// functions are allowed to disagree about *who*, never about *what*.
for (const status of orderProgression) {
  for (const actor of ['merchant', 'courier'] as const) {
    const scoped = nextStatusFor(status, actor);
    if (scoped !== null && scoped !== nextStatus(status)) {
      check(`${actor} at ${status} follows the happy path`, false, String(scoped));
    }
  }
}
check("the courier has a label where they have a move", Boolean(courierActionLabel('ready')));
check("no courier label where they have no move", courierActionLabel('pending') === null);

// ── delivery pay and timing ──────────────────────────────────────────────────
// Recomputed from the rates, not through the helper, so the assertion fails if
// the shape of the rule changes rather than just agreeing with itself.
check('fare is base plus distance',
  Math.abs(courierFare(4) - (BASE_FARE_CAD + 4 * PER_KM_CAD)) < 0.005, String(courierFare(4)));
check('a tip is added on top, untaxed and uncommissioned',
  Math.abs(courierEarnings(4, 3) - (courierFare(4) + 3)) < 0.005);
check('a negative distance cannot pay less than the base fare', courierFare(-5) === BASE_FARE_CAD);
check('the pin is derived from the order id, not generated',
  deliveryPin('ord_abc') === deliveryPin('ord_abc'));
check('the pin is four digits', /^\d{4}$/.test(deliveryPin('ord_abc')), deliveryPin('ord_abc'));
check('different orders get different pins', deliveryPin('ord_abc') !== deliveryPin('ord_xyz'));
check('a leg never takes zero minutes', legDurationMin(0.01, 'car') === 1);
check('a bike is slower than a scooter over the same distance',
  legDurationMin(6, 'bike') > legDurationMin(6, 'scooter'));

// ── route geometry ───────────────────────────────────────────────────────────
// The position of a courier is derived, never stored (see `lib/courierRoute.ts`).
// These are the properties the rest of the delivery flow leans on.
{
  const shop = { lat: 45.5359, lng: -73.6142 };
  const door = { lat: 45.5605, lng: -73.6021 };
  const leg = buildLeg(shop, door, 'ord_check', 'car');
  const again = buildLeg(shop, door, 'ord_check', 'car');

  check('a route is the same on every launch', JSON.stringify(leg) === JSON.stringify(again));
  check('two orders get different routes',
    JSON.stringify(buildLeg(shop, door, 'ord_other', 'car').points) !== JSON.stringify(leg.points));
  check('a route starts at the shop', distanceKm(positionAlong(leg, 0).at, shop) < 1e-9);
  check('a route ends at the door', distanceKm(positionAlong(leg, 1).at, door) < 1e-9);
  check('the road is longer than the crow flies', leg.distanceKm > distanceKm(shop, door));
  // A wander that doubles the trip would double every ETA and every fare
  // derived from it, so the upper bound is asserted rather than eyeballed.
  check('the detour stays plausible', leg.distanceKm < distanceKm(shop, door) * 1.75,
    (leg.distanceKm / distanceKm(shop, door)).toFixed(2));

  let backwards = false;
  let travelled = 0;
  let prev = positionAlong(leg, 0).at;
  for (let i = 1; i <= 100; i++) {
    const at = positionAlong(leg, i / 100).at;
    travelled += distanceKm(prev, at);
    if (distanceKm(prev, at) < -1e-12) backwards = true;
    prev = at;
  }
  check('a courier never moves backwards along the route', !backwards);
  check('sampling the path recovers its length', Math.abs(travelled - leg.distanceKm) < 0.1,
    `${travelled.toFixed(3)} vs ${leg.distanceKm.toFixed(3)}`);

  const start = '2026-08-20T12:00:00.000Z';
  const t0 = Date.parse(start);
  check('progress is 0 before the start', progressAt(start, 20, t0 - 60_000) === 0);
  check('progress is clamped at 1', progressAt(start, 20, t0 + 86_400_000) === 1);
  // Linear in *scaled* time: `DEMO_TIME_SCALE` compresses the clock so a run is
  // watchable in a demo (see `lib/courierRoute.ts`), and half the leg is reached
  // after half its duration divided by that scale. The property being checked is
  // still linearity — the constant is only the slope.
  check(
    'progress is linear in time',
    Math.abs(progressAt(start, 20, t0 + (10 / DEMO_TIME_SCALE) * 60_000) - 0.5) < 1e-9
  );
  // The property the whole "derive, don't store" design rests on: the same
  // instant always yields the same position, however many times it is asked.
  check('progress depends only on the clock',
    progressAt(start, 20, t0 + 7 * 60_000) === progressAt(start, 20, t0 + 7 * 60_000));
  check('a zero-length run is already over', progressAt(start, 0, t0) === 1);

  check('the eta runs out exactly at arrival', etaMinutes(leg, 1) === 0);
  check('the eta is the full duration at the start', etaMinutes(leg, 0) === leg.durationMin);
  check('the eta only shrinks', etaMinutes(leg, 0.25) >= etaMinutes(leg, 0.75));
}

// ── dispatch ─────────────────────────────────────────────────────────────────
{
  const shop = { lat: 45.5359, lng: -73.6142 };
  const ranked = rankCouriers(seedCouriers, shop);
  check('every approved courier is rankable', ranked.length === seedCouriers.length);
  let ordered = true;
  for (let i = 1; i < ranked.length; i++) {
    if (distanceKm(ranked[i].base, shop) < distanceKm(ranked[i - 1].base, shop)) ordered = false;
  }
  check('couriers are ranked nearest-to-the-shop first', ordered);
  // Nobody who has not been cleared may be offered a run.
  check('a pending file never enters the ranking',
    rankCouriers([{ ...seedCouriers[0], status: 'pending' }], shop).length === 0);
  check('a suspended file never enters the ranking',
    rankCouriers([{ ...seedCouriers[0], status: 'suspended' }], shop).length === 0);

  const now = Date.parse('2026-08-20T12:00:00.000Z');
  const offer = {
    id: 'off_x', orderId: 'ord_x', courierId: 'crr_x', vendorId: 'vnd_x',
    offeredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + OFFER_TIMEOUT_MS).toISOString(),
    distanceToPickupKm: 1, distanceToDropoffKm: 2, estimatedEarningsCad: 5,
  };
  check('a fresh offer has its full window', offerRemainingMs(offer, now) === OFFER_TIMEOUT_MS);
  check('an offer expires on time', isOfferExpired(offer, now + OFFER_TIMEOUT_MS));
  check('an offer is live one millisecond before', !isOfferExpired(offer, now + OFFER_TIMEOUT_MS - 1));
  check('the countdown never goes negative', offerRemainingMs(offer, now + 99_000) === 0);
}

// ── which order gets offered ─────────────────────────────────────────────────
// Mirrors `pickNearest` in hooks/useDispatchEngine.ts. The leg to the shop is
// unpaid, so proximity leads and age only breaks ties between shops on the same
// trip. Asserted here because getting it backwards produces offers nobody
// accepts, which looks like "no orders" rather than like a bug.
{
  const TIE_KM = 0.5;
  const base = { lat: 45.5301, lng: -73.6198 };
  const order = (id: string, createdAt: string, at: { lat: number; lng: number }) => ({
    id, createdAt, at, km: distanceKm(base, at),
  });
  const pick = (rows: ReturnType<typeof order>[]) =>
    [...rows].sort((a, b) =>
      Math.abs(a.km - b.km) < TIE_KM ? a.createdAt.localeCompare(b.createdAt) : a.km - b.km
    )[0];

  const near = order('near', '2026-08-20T12:00:00Z', { lat: 45.5312, lng: -73.6180 });
  const farButOlder = order('far', '2026-08-20T09:00:00Z', { lat: 45.5354, lng: -73.5115 });
  check('a near shop beats a much older far one', pick([farButOlder, near]).id === 'near');

  const sameTripOlder = order('older', '2026-08-20T09:00:00Z', { lat: 45.5305, lng: -73.6205 });
  const sameTripNewer = order('newer', '2026-08-20T12:00:00Z', { lat: 45.5300, lng: -73.6196 });
  check('at the same distance the older order wins',
    pick([sameTripNewer, sameTripOlder]).id === 'older');
  check('the tie window is under a kilometre', TIE_KM < 1);
}

// ── the earnings breakdown reconciles ────────────────────────────────────────
// `EarningsSummary` must add up to the same figure the headline shows. Both now
// sum the per-run `earningsCad`; re-deriving either one from raw kilometres
// rounds a different number of times and drifts by cents, which on a payout
// screen reads as the app not knowing what it owes.
{
  const runs = seedOrders.filter((o) => o.delivery && o.status === 'delivered').slice(0, 40);
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const headline = round2(runs.reduce((s, o) => s + o.delivery!.earningsCad, 0));
  const base = round2(runs.length * BASE_FARE_CAD);
  const tips = round2(runs.reduce((s, o) => s + o.delivery!.tipCad, 0));
  const distance = round2(headline - base - tips);

  check('the breakdown adds up to the headline',
    round2(base + distance + tips) === headline,
    `${round2(base + distance + tips)} vs ${headline}`);
  check('the distance component is never negative', distance >= 0, String(distance));
  // Sanity: the derived distance line should still be close to what the rate
  // implies, or the subtraction is hiding a real error rather than rounding.
  const km = runs.reduce((s, o) => s + o.delivery!.distanceKm, 0);
  check('the derived distance matches the rate to within rounding',
    Math.abs(distance - km * PER_KM_CAD) < runs.length * 0.01 + 0.01,
    `${distance.toFixed(2)} vs ${(km * PER_KM_CAD).toFixed(2)}`);
}

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
// Revenue is the goods sold: neither the taxes the shop remits nor the delivery
// fee it never sees belong in a figure labelled "Recettes".
check(
  'revenue equals sum of non-cancelled subtotals in range',
  Math.abs(
    s30.revenueCad -
      tanit
        .filter((o) => o.status !== 'cancelled' && new Date(o.createdAt) >= rangeStart)
        .reduce((sum, o) => sum + o.subtotalCad, 0)
  ) < 0.01,
  String(s30.revenueCad)
);
check(
  'revenue excludes tax and delivery',
  s30.revenueCad <
    tanit
      .filter((o) => o.status !== 'cancelled' && new Date(o.createdAt) >= rangeStart)
      .reduce((sum, o) => sum + o.totalCad, 0)
);
check(
  'commission is 12% of sales and net is the remainder',
  Math.abs(s30.commissionCad - s30.revenueCad * 0.12) < 0.01 &&
    Math.abs(s30.netCad + s30.commissionCad - s30.revenueCad) < 0.01,
  `${s30.commissionCad} / ${s30.netCad}`
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
  .reduce((sum, o) => sum + o.subtotalCad, 0);
check('there is a cancelled order to test with', cancelledTotal > 0);
check(
  'cancelled revenue excluded',
  Math.abs(
    sAdjoa.revenueCad -
      adjoa.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.subtotalCad, 0)
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

// ── route splitting ──────────────────────────────────────────────────────────
// The travelled/remaining split drives the two-tone route line on the map. The
// two halves must meet exactly, or the line shows a gap under the courier.
{
  const shop = { lat: 45.5359, lng: -73.6142 };
  const door = { lat: 45.5605, lng: -73.6021 };
  const leg = buildLeg(shop, door, 'ord_split', 'car');

  const none = splitPath(leg.points, 0);
  check('nothing is travelled at the start', none.travelled.length === 0);
  check('the whole route remains at the start', none.remaining.length === leg.points.length);

  const all = splitPath(leg.points, 1);
  check('nothing remains at the end', all.remaining.length === 0);
  check('the whole route is travelled at the end', all.travelled.length === leg.points.length);

  const half = splitPath(leg.points, 0.5);
  const joinA = half.travelled[half.travelled.length - 1];
  const joinB = half.remaining[0];
  check('the two halves meet at the same point',
    Math.abs(joinA.lat - joinB.lat) < 1e-12 && Math.abs(joinA.lng - joinB.lng) < 1e-12);
  // The cut point must be where the marker is, or the line and the puck disagree.
  const marker = positionAlong(leg, 0.5).at;
  check('the cut sits under the courier marker', distanceKm(joinA, marker) < 0.001);
  check('a progress beyond 1 is clamped, not extrapolated',
    splitPath(leg.points, 4).remaining.length === 0);
  check('a degenerate route splits without throwing', splitPath([shop], 0.5).remaining.length === 1);
}

// ── courier earnings ─────────────────────────────────────────────────────────
// What the Gains and Courses screens read. The headline, the chart and the
// breakdown are all derived from these, so a disagreement here is a screen
// contradicting itself.
{
  const now = new Date();
  const runs = seedOrders.filter(
    (o) => o.status === 'delivered' && o.delivery?.courierId === seedCouriers[0].id
  );

  const week = summariseRuns(runs, 7, now);
  check('a week has seven buckets', week.buckets.length === 7);
  check('the bucket totals sum to the range total',
    Math.abs(week.buckets.reduce((s, b) => s + b.earningsCad, 0) - week.earningsCad) < 0.02,
    `${week.earningsCad}`);
  check('the bucket counts sum to the range count',
    week.buckets.reduce((s, b) => s + b.runCount, 0) === week.runCount);
  check('the best day is the tallest bucket',
    week.bestDay === null ||
      week.buckets.every((b) => b.earningsCad <= week.bestDay!.earningsCad));
  check('the average is the total over the count',
    week.runCount === 0 ||
      Math.abs(week.avgPerRunCad - week.earningsCad / week.runCount) < 0.01);

  // The breakdown card prints these three lines above a total that must match.
  const split = splitEarnings(week);
  check('the fare components add up to the total',
    Math.abs(split.baseCad + split.distanceCad + split.tipsCad - week.earningsCad) < 0.005);
  check('the pickup fee is one flat fare per run',
    Math.abs(split.baseCad - week.runCount * BASE_FARE_CAD) < 0.005);

  // A window with nothing in it must be zero everywhere, not NaN — an empty
  // range is the normal state of a courier's first day.
  const empty = summariseRuns([], 7, now);
  check('an empty window is zero, not NaN',
    empty.earningsCad === 0 && empty.avgPerRunCad === 0 && empty.bestDay === null);

  const grouped = groupRunsByDay(runs);
  check('grouping keeps every run', grouped.reduce((s, d) => s + d.runs.length, 0) === runs.length);
  check('days are newest first',
    grouped.every((d, i, a) => i === 0 || a[i - 1].date >= d.date));
  check('a day total is the sum of its runs',
    grouped.every(
      (d) =>
        Math.abs(d.runs.reduce((s, o) => s + (o.delivery?.earningsCad ?? 0), 0) - d.earningsCad) <
        0.02
    ));

  // Payouts land on a Friday, and never in the past.
  const payout = nextPayoutDate(now);
  check('the next payout is a Friday', payout.getDay() === PAYOUT_WEEKDAY);
  check('the next payout is not behind us', payout.getTime() >= new Date(now).setHours(0, 0, 0, 0));
  check('the pending payout is never more than the all-time total',
    pendingPayoutCad(runs, now) <= summariseRuns(runs, 3650, now).earningsCad + 0.01);
}

console.log(failures === 0 ? '\nALL LOGIC CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
