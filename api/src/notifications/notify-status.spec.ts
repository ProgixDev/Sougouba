import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../db/client.js';
import { ORDER_STATUSES, type OrderStatus } from '../orders/order-status.js';
import { NotifyService } from './notify.service.js';
import type { PushMessage, PushService } from './push.service.js';

const ORDER = {
  id: '11111111-1111-4111-8111-111111111111',
  customerId: 'customer-1',
  totalCad: '42.36',
  vendor: { name: 'Épicerie Dakar', ownerId: 'owner-1' },
  items: [{ qty: 2 }],
};

/** Enough of the order read `NotifyService` makes, and a push service that only records. */
function service(order: typeof ORDER | null = ORDER) {
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: order, error: null }) }),
      }),
    }),
  } as unknown as Db;
  const send = vi.fn(async (_userIds: string[], _message: PushMessage) => undefined);
  return { notify: new NotifyService(db, { send } as unknown as PushService), send };
}

/** The push one status produces, if any: who it went to and what it says in French. */
async function pushFor(status: OrderStatus) {
  const { notify, send } = service();
  await notify.orderStatusChanged(ORDER.id, status);
  if (send.mock.calls.length === 0) return null;
  const [userIds, message] = send.mock.calls[0];
  return { userIds, message, fr: message.content('fr'), en: message.content('en') };
}

describe('order status pushes to the shopper', () => {
  it('sends one for every step after the order is placed', async () => {
    const sent: Record<string, string | null> = {};
    for (const status of ORDER_STATUSES) sent[status] = (await pushFor(status))?.fr.title ?? null;

    expect(sent).toEqual({
      // The shopper has just placed it themselves.
      pending: null,
      confirmed: 'Commande acceptée',
      preparing: 'Commande en préparation',
      ready: 'Commande prête',
      out_for_delivery: 'Votre commande est en route',
      delivered: 'Commande livrée',
      cancelled: 'Commande annulée',
    });
  });

  it('addresses the shopper, on the orders channel, and opens the order when tapped', async () => {
    for (const status of ['preparing', 'ready'] as const) {
      const push = await pushFor(status);

      expect(push?.userIds).toEqual(['customer-1']);
      // The channel must be one the app creates (`lib/push.ts`), or Android shows nothing.
      expect(push?.message.channel).toBe('orders');
      expect(push?.message.url).toBe(`/(customer)/order/${ORDER.id}`);
      expect(push?.fr.body).toContain('Épicerie Dakar');
      expect(push?.en.body).toContain('Épicerie Dakar');
    }
  });

  it('puts the two new steps under the order-updates switch, so they can be turned off', async () => {
    expect((await pushFor('preparing'))?.message.category).toBe('orderUpdates');
    expect((await pushFor('ready'))?.message.category).toBe('orderUpdates');
    // The courier leaving is the one alert kept apart.
    expect((await pushFor('out_for_delivery'))?.message.category).toBe('deliveryAlerts');
  });

  it('sends nothing, and does not throw, for an order that no longer exists', async () => {
    const { notify, send } = service(null);

    await expect(notify.orderStatusChanged(ORDER.id, 'ready')).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
