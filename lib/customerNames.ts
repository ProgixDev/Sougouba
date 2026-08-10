import type { Order } from '@/data/types';
import { users } from '@/data/seed/users';

/**
 * customerId → display name, for the shop-side order queue.
 *
 * Read straight from the seed rather than through `authApi`: there is no
 * "get user by id" endpoint, the shop only ever needs a label, and hitting an
 * async API for every row in a list would flash placeholder names on each
 * render. Orders placed in-app by a signed-up account fall through to a generic
 * label at the call site — the shop has no legitimate read on another user's
 * record in the real system either.
 */
export const customerNameById: Record<string, string> = Object.fromEntries(
  users.filter((u) => u.role === 'customer').map((u) => [u.id, u.fullName])
);

/**
 * What the shop should call the person who placed an order.
 *
 * Orders written by the app carry the name they were placed under; seeded ones
 * resolve through the table above. The generic label is the last resort, and
 * should now only appear for an order predating this field.
 */
export function customerLabel(order: Order): string {
  return order.customerName ?? customerNameById[order.customerId] ?? 'Client Sougouba';
}
