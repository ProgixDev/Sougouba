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

describe('pushes about the shop’s subscription', () => {
  const SHOP = 'shop-1';
  /** The one push a call produced: who it went to, where it opens, and what it says. */
  async function pushed(act: (notify: NotifyService) => Promise<void>) {
    // The shop's row, as `NotifyService` reads it: its name and who owns it.
    const { notify, send } = service({ name: 'Épicerie Dakar', ownerId: 'owner-1' } as never);
    await act(notify);
    expect(send).toHaveBeenCalledTimes(1);
    const [userIds, message] = send.mock.calls[0];
    return { userIds, url: message.url, fr: message.content('fr'), en: message.content('en') };
  }

  it('tells the owner the shop is offline, and what brings it back — by cause', async () => {
    const never = await pushed((n) => n.shopTakenOffline(SHOP, 'never_subscribed'));
    expect(never.userIds).toEqual(['owner-1']);
    expect(never.url).toBe('/(business)/(tabs)/profile');
    expect(never.fr).toEqual({
      title: 'Votre boutique est hors ligne',
      body: 'Souscrivez l’abonnement Sougouba depuis votre profil pour la mettre en ligne.',
    });
    expect(never.en.title).toBe('Your shop is offline');

    const late = await pushed((n) => n.shopTakenOffline(SHOP, 'past_due'));
    expect(late.fr.body).toContain('en retard');
    const ended = await pushed((n) => n.shopTakenOffline(SHOP, 'canceled'));
    expect(ended.fr.body).toContain('a pris fin');
  });

  it('tells the owner when the shop is back', async () => {
    const back = await pushed((n) => n.shopBackOnline(SHOP));
    expect(back.fr.title).toBe('Votre boutique est de nouveau en ligne');
    expect(back.en.title).toBe('Your shop is back online');
  });

  it('gives a failed payment its deadline when the shop will go offline, on Montréal’s calendar', async () => {
    // 03:30 UTC on the 13th is still the evening of the 12th in Montréal.
    const withDeadline = await pushed((n) => n.subscriptionPaymentFailed(SHOP, '2026-12-13T03:30:00.000Z'));
    expect(withDeadline.fr.body).toBe('Mettez votre carte à jour avant le 12 décembre, sinon votre boutique sera mise hors ligne.');
    expect(withDeadline.en.body).toBe('Update your card before December 12, or your shop will be taken offline.');

    // No deadline while the subscription is not required to sell: the message is the one it always was.
    const without = await pushed((n) => n.subscriptionPaymentFailed(SHOP));
    expect(without.fr.body).toBe('Mettez votre carte à jour depuis votre profil pour régler l’abonnement Sougouba.');
  });

  it('tells a shop approved while the subscription is required what puts it online', async () => {
    const live = await pushed((n) => n.applicationApproved('vendor', SHOP));
    expect(live.fr.body).toBe('Épicerie Dakar est en ligne : vous pouvez recevoir des commandes.');
    expect(live.url).toBe('/(business)/(tabs)/dashboard');

    const waiting = await pushed((n) => n.applicationApproved('vendor', SHOP, { awaitingSubscription: true }));
    expect(waiting.fr).toEqual({
      title: 'Votre boutique est approuvée',
      body: 'Souscrivez l’abonnement depuis votre profil pour mettre Épicerie Dakar en ligne.',
    });
    expect(waiting.en.body).toBe('Subscribe from your profile to put Épicerie Dakar online.');
    expect(waiting.url).toBe('/(business)/(tabs)/profile');
  });
});
