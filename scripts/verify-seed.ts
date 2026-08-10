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
  const tot = Math.round((o.subtotalCad + o.deliveryFeeCad) * 100) / 100;
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
console.log(bad === 0 ? '\nALL SEED INVARIANTS PASS' : `\n${bad} FAILURES`);
process.exit(bad === 0 ? 0 : 1);
