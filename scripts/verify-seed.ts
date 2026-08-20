import { BASE_FARE_CAD, PER_KM_CAD } from '../data/courierPay';
import { deliveryPin } from '../data/delivery';
import { GST_RATE, QST_RATE, taxesOn, orderTotal } from '../data/taxes';
import { couriers } from '../data/seed/couriers';
import { orders } from '../data/seed/orders';
import { vendors } from '../data/seed/vendors';
import { products } from '../data/seed/products';
import { users } from '../data/seed/users';

let bad = 0;
const fail = (m: string) => { console.log('  FAIL', m); bad++; };

const productById = new Map(products.map(p => [p.id, p]));
const vendorIds = new Set(vendors.map(v => v.id));
const userIds = new Set(users.map(u => u.id));

for (const o of orders) {
  if (!vendorIds.has(o.vendorId)) fail(`${o.id}: unknown vendor ${o.vendorId}`);
  if (!userIds.has(o.customerId)) fail(`${o.id}: unknown customer ${o.customerId}`);

  const sub = Math.round(o.items.reduce((s, i) => s + i.unitPriceCad * i.qty, 0) * 100) / 100;
  if (Math.abs(sub - o.subtotalCad) > 0.005) fail(`${o.id}: subtotal ${o.subtotalCad} != ${sub}`);
  // Recomputed from the rates rather than through `taxesOn`, so the assertion
  // fails if the rule changes shape — a check that called the same helper the
  // builder calls could only ever agree with it.
  const gst = Math.round(o.subtotalCad * GST_RATE * 100) / 100;
  const qst = Math.round(o.subtotalCad * QST_RATE * 100) / 100;
  if (Math.abs(gst - o.gstCad) > 0.005) fail(`${o.id}: TPS ${o.gstCad} != ${gst}`);
  if (Math.abs(qst - o.qstCad) > 0.005) fail(`${o.id}: TVQ ${o.qstCad} != ${qst}`);
  const tot = Math.round((o.subtotalCad + gst + qst + o.deliveryFeeCad) * 100) / 100;
  if (Math.abs(tot - o.totalCad) > 0.005) fail(`${o.id}: total ${o.totalCad} != ${tot}`);

  const vendorFee = vendors.find(v => v.id === o.vendorId)!.deliveryFeeCad;
  if (o.deliveryFeeCad !== vendorFee) fail(`${o.id}: fee ${o.deliveryFeeCad} != vendor ${vendorFee}`);

  for (const it of o.items) {
    const p = productById.get(it.productId);
    if (!p) { fail(`${o.id}: unknown product ${it.productId}`); continue; }
    if (p.vendorId !== o.vendorId) fail(`${o.id}: ${it.productId} belongs to ${p.vendorId}`);
    if (p.name !== it.name) fail(`${o.id}: name drift ${it.name} vs ${p.name}`);
    if (p.priceCad !== it.unitPriceCad) fail(`${o.id}: price drift ${it.unitPriceCad} vs ${p.priceCad}`);
  }

  if (o.statusHistory.at(-1)!.status !== o.status) fail(`${o.id}: history tail != status`);
  let prev = 0;
  for (const e of o.statusHistory) {
    const t = new Date(e.at).getTime();
    if (Number.isNaN(t)) fail(`${o.id}: bad timestamp ${e.at}`);
    if (t < prev) fail(`${o.id}: history goes backwards at ${e.status}`);
    prev = t;
  }
  if (new Date(o.statusHistory[0].at).getTime() !== new Date(o.createdAt).getTime())
    fail(`${o.id}: first history entry != createdAt`);
  // A dispute can only exist on a finished order, must be timestamped after the
  // order it is about, and only carries a reply once it is marked answered.
  if (o.dispute) {
    if (o.status !== 'delivered' && o.status !== 'cancelled')
      fail(`${o.id}: dispute on a live order (${o.status})`);
    if (new Date(o.dispute.openedAt).getTime() < new Date(o.createdAt).getTime())
      fail(`${o.id}: dispute predates the order`);
    if (!o.dispute.message.trim()) fail(`${o.id}: dispute has no message`);
    const answered = o.dispute.status === 'answered';
    if (answered !== Boolean(o.dispute.merchantReply))
      fail(`${o.id}: dispute status "${o.dispute.status}" disagrees with its reply`);
    if (o.dispute.answeredAt && new Date(o.dispute.answeredAt) < new Date(o.dispute.openedAt))
      fail(`${o.id}: reply predates the complaint`);
  }
}

// Both dispute states must be reachable on a first launch, or one of them is
// styled but never seen.
{
  const disputed = orders.filter((o) => o.dispute);
  if (!disputed.some((o) => o.dispute!.status === 'open')) fail('no open dispute in the seed');
  if (!disputed.some((o) => o.dispute!.status === 'answered')) fail('no answered dispute in the seed');
  console.log(`disputes: ${disputed.length} (${disputed.filter((o) => o.dispute!.status === 'open').length} open)`);
}

// ── shops ───────────────────────────────────────────────────────────────────
// Every shop that ships with the app is one an administrator already cleared.
// A seeded shop left `pending` would silently vanish from the customer browse,
// which is a bug that looks like an empty catalogue rather than like a bug.
for (const v of vendors) {
  if (v.status !== 'approved') fail(`${v.id}: seeded shop is ${v.status}`);
  if (v.registration) fail(`${v.id}: seeded shop carries an in-app registration`);
  if (!userIds.has(v.ownerId)) fail(`${v.id}: unknown owner ${v.ownerId}`);
}

// ── couriers and deliveries ─────────────────────────────────────────────────
{
  const courierIds = new Set(couriers.map((c) => c.id));
  for (const c of couriers) {
    if (!userIds.has(c.userId)) fail(`${c.id}: unknown account ${c.userId}`);
    const account = users.find((u) => u.id === c.userId)!;
    if (account.role !== 'courier') fail(`${c.id}: account ${c.userId} is ${account.role}`);
    if (account.courierId !== c.id) fail(`${c.id}: account points at ${account.courierId}`);
    if (c.vehicle === 'bike' && c.plate) fail(`${c.id}: a bike carries a plate`);
    if (c.vehicle !== 'bike' && !c.plate) fail(`${c.id}: motorised with no plate`);
    if (c.rating < 4 || c.rating > 5) fail(`${c.id}: rating ${c.rating} out of range`);
  }

  const withDelivery = orders.filter((o) => o.delivery);
  const onRoad = orders.filter(
    (o) => o.status === 'out_for_delivery' || o.status === 'delivered'
  );
  if (withDelivery.length !== onRoad.length) {
    fail(`${withDelivery.length} deliveries for ${onRoad.length} orders on the road`);
  }

  for (const o of withDelivery) {
    const d = o.delivery!;
    if (!courierIds.has(d.courierId)) fail(`${o.id}: unknown courier ${d.courierId}`);
    if (d.pin !== deliveryPin(o.id)) fail(`${o.id}: pin ${d.pin} is not derived from the id`);
    if (!/^\d{4}$/.test(d.pin)) fail(`${o.id}: pin ${d.pin} is not four digits`);
    // Recomputed from the rates, not through `courierEarnings` — a check that
    // called the builder's own helper could only ever agree with it.
    const fare = Math.round((BASE_FARE_CAD + d.distanceKm * PER_KM_CAD) * 100) / 100;
    const expected = Math.round((fare + d.tipCad) * 100) / 100;
    if (Math.abs(expected - d.earningsCad) > 0.005) {
      fail(`${o.id}: earnings ${d.earningsCad} != ${expected}`);
    }
    if (d.acceptedAt >= d.pickedUpAt!) fail(`${o.id}: accepted after pickup`);
    if (o.status === 'delivered') {
      if (!d.deliveredAt) fail(`${o.id}: delivered with no deliveredAt`);
      if (!d.proof) fail(`${o.id}: delivered with no proof`);
      if (d.deliveredAt! <= d.pickedUpAt!) fail(`${o.id}: delivered before pickup`);
    } else if (d.deliveredAt) {
      fail(`${o.id}: still on the road but carries deliveredAt`);
    }
    if (d.pickupEtaMin < 1 || d.dropoffEtaMin < 1) fail(`${o.id}: a leg takes zero minutes`);
  }

  const used = new Set(withDelivery.map((o) => o.delivery!.courierId));
  if (used.size < couriers.length) {
    fail(`only ${used.size} of ${couriers.length} couriers ever ran a delivery`);
  }
  if (!withDelivery.some((o) => o.delivery!.tipCad > 0)) fail('nobody in the seed ever tipped');
  console.log(`deliveries: ${withDelivery.length} across ${used.size} couriers`);
}

const perVendor: Record<string, number> = {};
orders.forEach(o => { perVendor[o.vendorId] = (perVendor[o.vendorId] ?? 0) + 1; });
const noOrders = vendors.filter(v => !perVendor[v.id]).map(v => v.id);

console.log(`orders: ${orders.length}`);
console.log('per vendor:', perVendor);
if (noOrders.length) fail('vendors with no orders: ' + noOrders.join(', '));
const statuses: Record<string, number> = {};
orders.forEach(o => { statuses[o.status] = (statuses[o.status] ?? 0) + 1; });
console.log('statuses:', statuses);
console.log('sample history:', JSON.stringify(orders[0].statusHistory, null, 0));
// The worked example printed in the CDC addendum (v1.1, §03). If a rate is ever
// edited by hand, this is the line that says so in the client's own numbers.
{
  const taxes = taxesOn(32.5);
  if (taxes.gstCad !== 1.63) fail(`CDC example: TPS ${taxes.gstCad} != 1.63`);
  if (taxes.qstCad !== 3.24) fail(`CDC example: TVQ ${taxes.qstCad} != 3.24`);
  const total = orderTotal(32.5, taxes, 4.99);
  if (total !== 42.36) fail(`CDC example: total ${total} != 42.36`);
}

console.log(bad === 0 ? '\nALL SEED INVARIANTS PASS' : `\n${bad} FAILURES`);
process.exit(bad === 0 ? 0 : 1);
