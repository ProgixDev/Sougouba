/**
 * The order-writing half of Phase 3's review gate.
 *
 * `verify:stripe` proved the payment path; this proves what happens after
 * Stripe confirms. It could not be written before: `place` was a Drizzle
 * transaction and no query this API issued had ever reached a database.
 *
 * The test that matters is the last one. Six writes happen inside
 * `order_place`, and a line selling out mid-checkout has to take *all* of them
 * back — including the stock already decremented for earlier lines, the points
 * debit and the coupon claim. A partial rollback here means a shopper is
 * charged for an order that does not exist, or loses points to one.
 *
 *   node --env-file=.env scripts/verify-orders.mjs
 *
 * Writes to the live database and cleans up after itself. Every order it
 * creates carries a marker in `customer_name` so a failed run leaves something
 * greppable rather than something indistinguishable from real data.
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MARKER = `verify-orders ${new Date().toISOString()}`;
const created = [];
let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// ── fixtures, all read from real seeded rows ────────────────────────────────
const vendor = await must(
  db.from('vendors').select('id, name, address_lat, address_lng').eq('status', 'approved').limit(1).single(),
  'pick a vendor'
);
const products = await must(
  db
    .from('products')
    .select('id, name, price_cad, stock_qty')
    .eq('vendor_id', vendor.id)
    .eq('is_available', true)
    .gt('stock_qty', 2)
    .limit(2),
  'pick products'
);
if (products.length < 2) throw new Error('need two in-stock products from one shop');

const address = await must(db.from('addresses').select('*').limit(1).single(), 'pick an address');
const customerId = address.profile_id;

const line = (p, qty) => ({ productId: p.id, name: p.name, qty, unitPriceCad: Number(p.price_cad) });
const baseArgs = {
  p_customer_id: customerId,
  p_customer_name: MARKER,
  p_vendor_id: vendor.id,
  // Already rounded to cents, because `roundCad` rounds before anything is
  // handed to the database. The money columns are numeric(10,2), so passing a
  // four-decimal total here would test the schema's rounding rather than this
  // function — and no real caller does it.
  p_subtotal_cad: 10,
  p_gst_cad: 0.5,
  p_qst_cad: 1.0,
  p_delivery_fee_cad: 2.99,
  p_total_cad: 14.49,
  p_addr_label: address.label,
  p_addr_street: address.street,
  p_addr_city: address.city,
  p_addr_postal_code: address.postal_code,
  p_addr_lat: address.lat,
  p_addr_lng: address.lng,
};

const stockOf = async (id) => (await must(db.from('products').select('stock_qty').eq('id', id).single(), 'stock')).stock_qty;

console.log(`\nshop: ${vendor.name}   lines: ${products[0].name}, ${products[1].name}\n`);

// ── 1. the happy path writes all five things ───────────────────────────────
console.log('happy path');
{
  const before0 = await stockOf(products[0].id);
  const before1 = await stockOf(products[1].id);

  const orderId = await must(
    db.rpc('order_place', {
      ...baseArgs,
      p_payment_intent_id: `pi_verify_${Date.now()}`,
      p_items: [line(products[0], 1), line(products[1], 2)],
    }),
    'order_place'
  );
  created.push(orderId);

  const order = await must(db.from('orders').select('*').eq('id', orderId).single(), 'read order');
  const items = await must(db.from('order_items').select('*').eq('order_id', orderId), 'read items');
  const history = await must(db.from('order_status_history').select('*').eq('order_id', orderId), 'read history');

  check('order row written', !!order);
  check('status is pending', order.status === 'pending', order.status);
  check('total preserved as priced', Number(order.total_cad) === 14.49, order.total_cad);
  check('address snapshotted onto the order', order.delivery_address_street === address.street);
  check('both line items written', items.length === 2, `got ${items.length}`);
  check('line name snapshotted', items.some((i) => i.name === products[0].name));
  check('one history row, pending', history.length === 1 && history[0].status === 'pending');
  check('stock decremented by qty (line 1)', (await stockOf(products[0].id)) === before0 - 1);
  check('stock decremented by qty (line 2)', (await stockOf(products[1].id)) === before1 - 2);
}

// ── 2. the same intent twice does not write a second order ─────────────────
// The service checks this before calling Stripe, but the column carries a
// unique index and that is what actually holds it.
console.log('\nidempotency');
{
  const intent = `pi_verify_dup_${Date.now()}`;
  const first = await must(
    db.rpc('order_place', { ...baseArgs, p_payment_intent_id: intent, p_items: [line(products[0], 1)] }),
    'first'
  );
  created.push(first);

  const { error } = await db.rpc('order_place', {
    ...baseArgs,
    p_payment_intent_id: intent,
    p_items: [line(products[0], 1)],
  });
  check('a replayed payment intent is refused by the database', !!error, 'a second order was written');
  if (error) check('  …as a unique violation', error.code === '23505', error.code);
}

// ── 3. the rollback. This is the one worth having. ─────────────────────────
console.log('\nsold out mid-checkout — everything rolls back');
{
  const before0 = await stockOf(products[0].id);
  const overStock = (await stockOf(products[1].id)) + 1;
  // A head-count answers in `count`, not `data` — `must` would hand back null.
  // The baseline is non-zero on purpose: the orders the tests above wrote are
  // legitimately still here, and what this asserts is that the failed attempt
  // adds nothing to them.
  const { count: ordersBefore } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_name', MARKER);

  const { error } = await db.rpc('order_place', {
    ...baseArgs,
    p_payment_intent_id: `pi_verify_soldout_${Date.now()}`,
    // Line 1 succeeds and decrements. Line 2 cannot. If the decrement from
    // line 1 survives, the transaction is not a transaction.
    p_items: [line(products[0], 1), line(products[1], overStock)],
  });

  check('refused', !!error);
  check('  …with SGB01, not a generic failure', error?.code === 'SGB01', error?.code);
  check('  …naming the product that sold out', error?.message?.includes(products[1].name), error?.message);

  const after0 = await stockOf(products[0].id);
  check('the earlier line\'s stock decrement was rolled back', after0 === before0, `${before0} → ${after0}`);

  const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('customer_name', MARKER);
  check('no order row survived', count === ordersBefore, `${ordersBefore} → ${count}`);
}

// ── cleanup ────────────────────────────────────────────────────────────────
// Restore the stock this script consumed, then delete its orders. Items and
// history go with the order via ON DELETE CASCADE.
console.log('\ncleanup');
{
  for (const id of created) {
    const items = await must(db.from('order_items').select('product_id, qty').eq('order_id', id), 'items');
    for (const item of items) {
      const current = await stockOf(item.product_id);
      await db.from('products').update({ stock_qty: current + item.qty }).eq('id', item.product_id);
    }
  }
  const { error } = await db.from('orders').delete().eq('customer_name', MARKER);
  const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('customer_name', MARKER);
  check('test orders removed', !error && count === 0, error?.message ?? `${count} left`);
}

console.log(`\n${failed === 0 ? '✅' : '❌'}  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
