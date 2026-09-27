/**
 * The dispatch race.
 *
 * Two couriers can tap Accepter within the same second, and the loser has to be
 * told rather than silently handed a delivery someone else is already driving.
 * The mock's `assignCourier` stated that rule but could only enforce it because
 * it was single-threaded; here the compare-and-swap is the `order_deliveries`
 * insert, whose primary key is `order_id`.
 *
 *   node --env-file=.env scripts/verify-dispatch.mjs
 *
 * Writes offers and a delivery against a real waiting order, then removes them.
 * Everything it creates is deleted on the way out, including after a failure.
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

const created = { offers: [], deliveries: [] };

async function cleanup() {
  for (const orderId of created.deliveries) await db.from('order_deliveries').delete().eq('order_id', orderId);
  for (const id of created.offers) await db.from('dispatch_offers').delete().eq('id', id);
}

try {
  // ── fixtures ─────────────────────────────────────────────────────────────
  const waiting = (await db.rpc('dispatch_waiting_orders', { p_limit: 1 })).data?.[0];
  if (!waiting) throw new Error('no waiting order to dispatch');

  const couriers = (await db.from('couriers').select('id, vehicle').eq('status', 'approved').limit(2)).data ?? [];
  if (couriers.length < 2) throw new Error('need two approved couriers');

  console.log(`\norder ${waiting.order_id.slice(0, 8)}, couriers ${couriers.map((c) => c.id.slice(0, 8)).join(' + ')}`);

  // Two live offers on one order — the state the race needs.
  console.log('\ntwo couriers hold a live offer on the same run');
  const offers = [];
  for (const c of couriers) {
    const { data, error } = await db
      .from('dispatch_offers')
      .insert({
        order_id: waiting.order_id,
        courier_id: c.id,
        vendor_id: waiting.vendor_id,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        distance_to_pickup_km: 1.5,
        distance_to_dropoff_km: 3.2,
        estimated_earnings_cad: 6.38,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seeding an offer: ${error.message}`);
    created.offers.push(data.id);
    offers.push({ offerId: data.id, courierId: c.id });
  }
  check('both offers exist', offers.length === 2);

  // ── the race ─────────────────────────────────────────────────────────────
  console.log('\nboth accept; exactly one wins');
  const accept = (o) =>
    db.rpc('dispatch_accept', {
      p_offer_id: o.offerId,
      p_order_id: waiting.order_id,
      p_courier_id: o.courierId,
      p_pickup_eta_min: 8,
      p_dropoff_eta_min: 14,
      p_distance_km: 3.2,
      p_pin: '4821',
      p_earnings_cad: 6.38,
    });

  // Fired together, not sequenced — the point is that the database arbitrates.
  const [a, b] = await Promise.all([accept(offers[0]), accept(offers[1])]);
  const winners = [a, b].filter((r) => !r.error);
  const losers = [a, b].filter((r) => r.error);

  check('exactly one accept succeeded', winners.length === 1, `${winners.length} succeeded`);
  check('exactly one was refused', losers.length === 1, `${losers.length} refused`);
  check('the loser got SGB07, not a generic failure', losers[0]?.error?.code === 'SGB07', losers[0]?.error?.code);
  check('the loser was told why', /already taken/i.test(losers[0]?.error?.message ?? ''), losers[0]?.error?.message);

  if (winners.length === 1) created.deliveries.push(waiting.order_id);

  // ── the consequences ─────────────────────────────────────────────────────
  console.log('\nand the run belongs to exactly one of them');
  const deliveries = (await db.from('order_deliveries').select('*').eq('order_id', waiting.order_id)).data ?? [];
  check('one delivery row, not two', deliveries.length === 1, `${deliveries.length} rows`);
  check('the PIN was stored, not derived from the order id',
    deliveries[0]?.pin === '4821' && !waiting.order_id.includes(deliveries[0]?.pin ?? 'x'));

  const after = (await db.from('dispatch_offers').select('id, outcome').eq('order_id', waiting.order_id)).data ?? [];
  const accepted = after.filter((o) => o.outcome === 'accepted');
  const expired = after.filter((o) => o.outcome === 'expired');
  check('the winning offer is marked accepted', accepted.length === 1, `${accepted.length}`);
  // Every other live offer is moot the moment one is accepted — a stale offer
  // sitting on someone's screen is worse than a statement.
  check('the other offer was expired, not left pending', expired.length === 1 && after.every((o) => o.outcome !== null),
    JSON.stringify(after.map((o) => o.outcome)));

  // ── the lapse sweep ──────────────────────────────────────────────────────
  console.log('\nlapsed offers expire on the database\'s clock');
  {
    // A *different* order: `dispatch_offers_one_per_order_courier` means these
    // couriers cannot hold a second offer on the one above.
    const other = (await db.rpc('dispatch_waiting_orders', { p_limit: 5 })).data
      ?.find((o) => o.order_id !== waiting.order_id);
    const { data: stale, error } = !other ? { error: { message: 'no second waiting order' } } : await db
      .from('dispatch_offers')
      .insert({
        order_id: other.order_id,
        vendor_id: other.vendor_id,
        courier_id: couriers[0].id,
        // Already past — this is the offer on a killed app that the mock's
        // device-side setTimeout could never expire.
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        distance_to_pickup_km: 1,
        distance_to_dropoff_km: 1,
        estimated_earnings_cad: 4,
      })
      .select('id')
      .single();
    if (error) {
      console.log(`    – skipped: ${error.message}`);
    } else {
      created.offers.push(stale.id);
      const swept = (await db.rpc('dispatch_expire_lapsed')).data;
      const row = (await db.from('dispatch_offers').select('outcome').eq('id', stale.id).single()).data;
      check('the sweep reported work', swept >= 1, `${swept}`);
      check('the lapsed offer is expired', row?.outcome === 'expired', row?.outcome);
    }
  }
} finally {
  console.log('\ncleanup');
  await cleanup();
  const left = (await db.from('order_deliveries').select('order_id', { count: 'exact', head: true }).eq('pin', '4821')).count;
  check('nothing this script created remains', !left, `${left} delivery row(s) left`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
