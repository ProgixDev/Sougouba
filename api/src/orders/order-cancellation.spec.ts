import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { cancelOrderAdminSchema } from '../admin/dto/admin.dto.js';
import { releaseRunSchema } from '../courier/dto/courier.dto.js';
import { courierCopy, customerCopy, merchantCopy } from '../notifications/messages.js';
import { cancelOrderSchema } from './dto/order.dto.js';
import { OrderCancellationService } from './order-cancellation.service.js';
import { canCancelAs, ORDER_STATUSES, SYSTEM_CANCEL_FROM, type CancelActor, type OrderStatus } from './order-status.js';
import { StalledOrdersService } from './stalled-orders.service.js';

describe('who may cancel an order, and until when', () => {
  const allowed = (actor: CancelActor) => ORDER_STATUSES.filter((status) => canCancelAs(status, actor));

  it('lets the shopper cancel only while the shop has not answered', () => {
    expect(allowed('customer')).toEqual(['pending']);
  });

  it('lets the shop cancel while it still holds the bag', () => {
    expect(allowed('merchant')).toEqual(['pending', 'confirmed', 'preparing']);
  });

  it('lets the back office cancel at any step before delivery', () => {
    expect(allowed('admin')).toEqual(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']);
  });

  it('lets the timers cancel only where an order waits on someone: the shop’s answer, or a courier', () => {
    expect(allowed('system')).toEqual(['pending', 'ready']);
    expect(SYSTEM_CANCEL_FROM).toEqual({ shop_no_response: 'pending', no_courier: 'ready' });
  });

  it('lets nobody cancel an order that is delivered or already cancelled', () => {
    for (const actor of ['customer', 'merchant', 'admin', 'system'] as const) {
      expect(canCancelAs('delivered', actor), actor).toBe(false);
      expect(canCancelAs('cancelled', actor), actor).toBe(false);
    }
  });
});

describe('the reason asked for', () => {
  it('takes a shopper’s reason from the list, with no note needed', () => {
    expect(cancelOrderSchema.safeParse({ reason: 'changed_mind' }).success).toBe(true);
    expect(cancelOrderSchema.safeParse({ reason: 'because' }).success).toBe(false);
    expect(cancelOrderSchema.safeParse({}).success).toBe(false);
  });

  it('asks the shopper for a sentence when the reason is “other”', () => {
    expect(cancelOrderSchema.safeParse({ reason: 'other' }).success).toBe(false);
    expect(cancelOrderSchema.safeParse({ reason: 'other', note: '  ok ' }).success).toBe(false);
    expect(cancelOrderSchema.safeParse({ reason: 'other', note: 'Je pars en voyage' }).success).toBe(true);
  });

  it('asks a courier the same, and never accepts “order_cancelled” from one', () => {
    expect(releaseRunSchema.safeParse({ reason: 'vehicle_problem' }).success).toBe(true);
    expect(releaseRunSchema.safeParse({ reason: 'other' }).success).toBe(false);
    expect(releaseRunSchema.safeParse({ reason: 'other', note: 'Urgence familiale' }).success).toBe(true);
    // Written by the cancellation path only.
    expect(releaseRunSchema.safeParse({ reason: 'order_cancelled' }).success).toBe(false);
  });

  it('requires staff to write a real reason', () => {
    expect(cancelOrderAdminSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(cancelOrderAdminSchema.safeParse({ reason: 'test' }).success).toBe(false);
    expect(cancelOrderAdminSchema.safeParse({ reason: 'Client injoignable' }).success).toBe(true);
  });
});

// ── the service, against a database and a Stripe that only remember what they were asked ──

interface Order {
  id: string;
  status: OrderStatus;
  customerId: string;
  vendorId: string;
  totalCad: string;
  refundedAt: string | null;
  stripePaymentIntentId: string | null;
  merchantPaidCad: string | null;
}

const ORDER: Order = {
  id: 'order-1',
  status: 'pending',
  customerId: 'customer-1',
  vendorId: 'vendor-1',
  totalCad: '29.13',
  refundedAt: null,
  stripePaymentIntentId: 'pi_1',
  merchantPaidCad: '0.00',
};

function harness(order: Order | null, opts: { movedInDb?: boolean; stripeFails?: boolean; courierId?: string | null } = {}) {
  const calls: string[] = [];
  const rpcArgs: Record<string, Record<string, unknown>> = {};
  const refunds: { amount: number; orderId: string; unwind: boolean }[] = [];
  const notified: unknown[] = [];

  const db = {
    from: () => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => {
          const match =
            order &&
            filters.id === order.id &&
            (filters.customer_id === undefined || filters.customer_id === order.customerId) &&
            (filters.vendor_id === undefined || filters.vendor_id === order.vendorId);
          return { data: match ? order : null, error: null };
        },
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(`rpc:${name}`);
      rpcArgs[name] = args;
      if ((name === 'order_cancel' || name === 'admin_order_cancel') && opts.movedInDb) {
        return { data: null, error: { code: 'SGB04', message: 'moved' } };
      }
      if (name === 'order_cancel_refunded') return { data: true, error: null };
      return { data: { courierId: opts.courierId ?? null }, error: null };
    },
  };
  const payments = {
    refundCancelledOrder: async (_pi: string, amount: number, o: { orderId: string; unwind: boolean }) => {
      calls.push('stripe:refund');
      if (opts.stripeFails) throw new Error('card_declined');
      refunds.push({ amount, ...o });
      return 're_1';
    },
  };
  const receipts = { orderRefunded: async () => void calls.push('email:refund') };
  const notify = { orderCancelled: async (_id: string, event: unknown) => void (calls.push('push'), notified.push(event)) };

  const service = new OrderCancellationService(db as never, payments as never, receipts as never, notify as never);
  return { service, calls, rpcArgs, refunds, notified };
}

describe('cancelling an order', () => {
  it('cancels first, refunds second, then tells people — in that order', async () => {
    const h = harness(ORDER);
    const outcome = await h.service.byCustomer('customer-1', 'order-1', { reason: 'changed_mind', note: 'plus besoin' });

    expect(h.calls).toEqual(['rpc:order_cancel', 'stripe:refund', 'rpc:order_cancel_refunded', 'push', 'email:refund']);
    expect(h.rpcArgs.order_cancel).toEqual({
      p_order_id: 'order-1',
      // The status that was read: the database only cancels if it still holds.
      p_from: 'pending',
      p_by: 'customer',
      p_by_id: 'customer-1',
      p_reason: 'changed_mind',
      p_note: 'plus besoin',
    });
    expect(h.refunds).toEqual([{ amount: 2913, orderId: 'order-1', unwind: false }]);
    expect(h.rpcArgs.order_cancel_refunded).toMatchObject({ p_amount_cad: 29.13, p_stripe_refund_id: 're_1' });
    expect(outcome).toEqual({ refund: 'refunded', refundAmountCad: 29.13, courierId: null });
    expect(h.notified).toEqual([{ by: 'customer', reason: 'changed_mind', refunded: true, courierId: null }]);
  });

  it('sends no money when the order moved under the request', async () => {
    const h = harness(ORDER, { movedInDb: true });
    await expect(h.service.byCustomer('customer-1', 'order-1', { reason: 'changed_mind' })).rejects.toBeInstanceOf(ConflictException);
    // The whole point of cancelling first: a lost race refunds nothing and tells nobody.
    expect(h.calls).toEqual(['rpc:order_cancel']);
  });

  it('refuses the shopper once the shop has accepted, before touching anything', async () => {
    for (const status of ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'] as const) {
      const h = harness({ ...ORDER, status });
      await expect(h.service.byCustomer('customer-1', 'order-1', { reason: 'changed_mind' }), status).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(h.calls, status).toEqual([]);
    }
  });

  it('answers somebody else’s order like one that does not exist', async () => {
    const h = harness(ORDER);
    await expect(h.service.byCustomer('customer-2', 'order-1', { reason: 'changed_mind' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.byMerchant('owner-9', 'vendor-9', 'order-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(h.calls).toEqual([]);
  });

  it('keeps the cancellation when Stripe refuses the refund, and says so', async () => {
    const h = harness(ORDER, { stripeFails: true });
    const outcome = await h.service.byCustomer('customer-1', 'order-1', { reason: 'changed_mind' });
    expect(outcome).toEqual({ refund: 'failed', refundAmountCad: null, courierId: null });
    // Not recorded as refunded, no refund email, and the push does not promise money.
    expect(h.calls).toEqual(['rpc:order_cancel', 'stripe:refund', 'push']);
    expect(h.notified).toEqual([{ by: 'customer', reason: 'changed_mind', refunded: false, courierId: null }]);
  });

  it('moves no money on an order that was never paid by card, or already refunded', async () => {
    for (const order of [{ ...ORDER, stripePaymentIntentId: null }, { ...ORDER, refundedAt: '2026-11-24T10:00:00Z' }]) {
      const h = harness(order);
      const outcome = await h.service.byCustomer('customer-1', 'order-1', { reason: 'changed_mind' });
      expect(outcome.refund).toBe('not_needed');
      expect(h.calls).toEqual(['rpc:order_cancel', 'push']);
    }
  });

  it('pulls the shop’s share back when Stripe had split the payment', async () => {
    const h = harness({ ...ORDER, merchantPaidCad: '25.63' });
    await h.service.byCustomer('customer-1', 'order-1', { reason: 'changed_mind' });
    expect(h.refunds[0].unwind).toBe(true);
  });

  it('lets the shop cancel while it holds the bag, and refunds the shopper', async () => {
    const h = harness({ ...ORDER, status: 'preparing' });
    const outcome = await h.service.byMerchant('owner-1', 'vendor-1', 'order-1');
    expect(h.rpcArgs.order_cancel).toMatchObject({ p_by: 'merchant', p_by_id: 'owner-1', p_from: 'preparing' });
    expect(outcome.refund).toBe('refunded');

    const late = harness({ ...ORDER, status: 'ready' });
    await expect(late.service.byMerchant('owner-1', 'vendor-1', 'order-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(late.calls).toEqual([]);
  });

  it('sends staff through the audited function, with their reason, at any step before delivery', async () => {
    const h = harness({ ...ORDER, status: 'out_for_delivery' }, { courierId: 'courier-7' });
    const outcome = await h.service.byAdmin('admin-1', 'order-1', 'Client injoignable');
    expect(h.calls[0]).toBe('rpc:admin_order_cancel');
    expect(h.rpcArgs.admin_order_cancel).toEqual({
      p_admin_id: 'admin-1',
      p_order_id: 'order-1',
      p_from: 'out_for_delivery',
      p_reason: 'Client injoignable',
    });
    // The courier the cancellation released is handed on, so they can be told.
    expect(outcome.courierId).toBe('courier-7');
    expect(h.notified).toEqual([{ by: 'admin', reason: null, refunded: true, courierId: 'courier-7' }]);
  });

  it('refuses staff on a delivered or already cancelled order', async () => {
    for (const status of ['delivered', 'cancelled'] as const) {
      const h = harness({ ...ORDER, status });
      await expect(h.service.byAdmin('admin-1', 'order-1', 'trop tard'), status).rejects.toBeInstanceOf(ConflictException);
      expect(h.calls).toEqual([]);
    }
  });

  it('lets the timer cancel a packed order, and shrug when a courier got there first', async () => {
    const h = harness({ ...ORDER, status: 'ready' });
    expect(await h.service.bySystem('order-1', 'no_courier')).toMatchObject({ refund: 'refunded' });
    expect(h.rpcArgs.order_cancel).toMatchObject({ p_by: 'system', p_by_id: null, p_reason: 'no_courier', p_from: 'ready' });

    // Picked up in the meantime: not the timer's to cancel, and not an error.
    expect(await harness({ ...ORDER, status: 'out_for_delivery' }).service.bySystem('order-1', 'no_courier')).toBeNull();
    // Moved between the read and the write: same.
    expect(await harness({ ...ORDER, status: 'ready' }, { movedInDb: true }).service.bySystem('order-1', 'no_courier')).toBeNull();
    expect(await harness(null).service.bySystem('order-1', 'no_courier')).toBeNull();
  });

  it('lets the shop-answer timer cancel a pending order, and only a pending one', async () => {
    const h = harness(ORDER);
    expect(await h.service.bySystem('order-1', 'shop_no_response')).toMatchObject({ refund: 'refunded' });
    expect(h.rpcArgs.order_cancel).toMatchObject({ p_by: 'system', p_by_id: null, p_reason: 'shop_no_response', p_from: 'pending' });
    expect(h.rpcArgs.order_cancel_refunded.p_reason).toBe('Commande annulée : la boutique n’a pas répondu');
    expect(h.notified).toEqual([{ by: 'system', reason: 'shop_no_response', refunded: true, courierId: null }]);

    // Each timer keeps to its own status: the shop accepted in the meantime, or the order is packed.
    for (const status of ['confirmed', 'preparing', 'ready', 'out_for_delivery'] as const) {
      const moved = harness({ ...ORDER, status });
      expect(await moved.service.bySystem('order-1', 'shop_no_response'), status).toBeNull();
      expect(moved.calls, status).toEqual([]);
    }
    // And the courier timer never cancels an order the shop has not even seen.
    const pending = harness(ORDER);
    expect(await pending.service.bySystem('order-1', 'no_courier')).toBeNull();
    expect(pending.calls).toEqual([]);
  });
});

describe('what people are told', () => {
  it('tells the shopper who cancelled, and mentions the refund only once it is real', () => {
    const base = { ref: '#A1B2', vendor: 'Marché Teranga' };
    expect(customerCopy.cancelledBy({ ...base, by: 'merchant', refunded: true }, 'fr').body).toBe(
      'Marché Teranga a annulé votre commande #A1B2. Vous êtes remboursé.'
    );
    expect(customerCopy.cancelledBy({ ...base, by: 'system', refunded: false }, 'fr').body).toBe(
      'Aucun livreur n’était disponible pour votre commande #A1B2 : elle est annulée.'
    );
    expect(customerCopy.cancelledBy({ ...base, by: 'admin', refunded: true }, 'en').body).toBe(
      'Sougouba cancelled your order #A1B2. You have been refunded.'
    );
  });

  it('tells both sides when the shop never answered', () => {
    expect(
      customerCopy.cancelledBy({ ref: '#A1B2', vendor: 'Marché Teranga', by: 'system', reason: 'shop_no_response', refunded: true }, 'fr').body
    ).toBe('Marché Teranga n’a pas répondu à votre commande #A1B2 : elle est annulée. Vous êtes remboursé.');
    expect(merchantCopy.orderCancelled({ ref: '#A1B2', by: 'system', reason: 'shop_no_response' }, 'fr').body).toBe(
      'Commande #A1B2 annulée : elle n’a pas été acceptée à temps. Le client est remboursé.'
    );
  });

  it('tells a late courier what to do and how long is left, then that the run is gone', () => {
    const base = { ref: '#A1B2', vendor: 'Marché Teranga' };
    expect(courierCopy.pickupOverdue({ ...base, minutesLeft: 10 }, 'fr')).toEqual({
      title: 'Marché Teranga vous attend',
      body: 'Commande #A1B2 : récupérez-la ou rendez la course. Sinon elle sera confiée à un autre livreur dans 10 min.',
    });
    expect(courierCopy.pickupOverdue({ ...base, minutesLeft: null }, 'en').body).toBe('Order #A1B2: pick it up, or hand the run back if you cannot.');
    expect(courierCopy.runTakenBack(base, 'fr').body).toBe(
      'La commande #A1B2 (Marché Teranga) n’a pas été récupérée à temps : elle a été confiée à un autre livreur.'
    );
  });

  it('reminds the shop how long it has left — or just nudges when nothing cancels automatically', () => {
    expect(merchantCopy.orderWaiting({ ref: '#A1B2', minutesLeft: 7 }, 'fr').body).toBe(
      'Commande #A1B2 : acceptez-la, sinon elle sera annulée dans 7 min.'
    );
    expect(merchantCopy.orderWaiting({ ref: '#A1B2', minutesLeft: null }, 'en').body).toBe('Order #A1B2: accept or decline it from the app.');
  });

  it('tells the shop to stop preparing an order its customer cancelled', () => {
    expect(merchantCopy.orderCancelled({ ref: '#A1B2', by: 'customer' }, 'fr').body).toBe(
      'Le client a annulé la commande #A1B2. Ne la préparez pas.'
    );
  });
});

// ── orders nobody is carrying ──

function stalledHarness(opts: {
  settings: Record<string, number | undefined> | null;
  orders: { order_id: string; waiting_min: number; alerted?: boolean; reminded?: boolean; offers?: number }[];
  /** Order ids another sweep already flagged between the read and the claim. */
  claimedElsewhere?: string[];
  /** Rows `deliveries_awaiting_pickup` answers with. */
  pickups?: { order_id: string; courier_id: string; late_min: number; reminded?: boolean; has_open_issue?: boolean }[];
  /** Order ids whose courier picked up between the read and the take-back. */
  pickedUpMeanwhile?: string[];
  staffEmail?: string;
}) {
  const cancelled: string[] = [];
  const cancelReasons: string[] = [];
  const claimed: string[] = [];
  const reminders: { orderId: string; minutesLeft: number | null }[] = [];
  const courierPushes: { orderId: string; courierId: string; event: unknown }[] = [];
  const released: Record<string, unknown>[] = [];
  const mails: { to: string; subject: string; text: string }[] = [];
  let rpcArgs: Record<string, unknown> | null = null;
  let rpcName: string | null = null;

  const db = {
    from: (table: string) => {
      if (table === 'platform_settings') {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: opts.settings, error: null }) };
        return q;
      }
      // orders: the conditional stamp that claims an alert
      let id = '';
      const q = {
        update: () => q,
        eq: (column: string, value: string) => {
          if (column === 'id' || column === 'order_id') id = value;
          return q;
        },
        or: () => q,
        is: () => q,
        select: async () => {
          if (opts.claimedElsewhere?.includes(id)) return { data: [], error: null };
          claimed.push(id);
          return { data: [{ id }], error: null };
        },
      };
      return q;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'delivery_release') {
        if (opts.pickedUpMeanwhile?.includes(args.p_order_id as string)) return { data: null, error: { code: 'SGB12', message: 'no longer releasable' } };
        released.push(args);
        return { data: null, error: null };
      }
      rpcName = name;
      rpcArgs = args;
      if (name === 'deliveries_awaiting_pickup') {
        return {
          data: (opts.pickups ?? []).map((p) => ({
            courier_name: 'Karim',
            vendor_id: 'vendor-1',
            vendor_name: 'Marché Teranga',
            customer_name: 'Awa',
            total_cad: 29.13,
            accepted_at: '2026-11-24T14:00:00+00:00',
            due_at: '2026-11-24T14:10:00+00:00',
            reminded: false,
            has_open_issue: false,
            ...p,
          })),
          error: null,
        };
      }
      return {
        data: opts.orders.map((o) => ({
          vendor_id: 'vendor-1',
          vendor_name: 'Marché Teranga',
          customer_name: 'Awa',
          total_cad: 29.13,
          waiting_since: '2026-11-24T14:00:00+00:00',
          offers: 0,
          ...o,
        })),
        error: null,
      };
    },
  };
  const cancellation = {
    bySystem: async (orderId: string, reason: string) => (cancelled.push(orderId), cancelReasons.push(reason), { refund: 'refunded' }),
  };
  const notify = {
    orderWaitingForShop: async (orderId: string, minutesLeft: number | null) => void reminders.push({ orderId, minutesLeft }),
    courierPickupOverdue: async (orderId: string, courierId: string, event: unknown) => void courierPushes.push({ orderId, courierId, event }),
  };
  const mail = { send: async (m: { to: string; subject: string; text: string }) => void mails.push(m) };
  const config = { get: (key: string) => (key === 'STAFF_ALERT_EMAIL' ? opts.staffEmail : undefined) };

  const service = new StalledOrdersService(db as never, cancellation as never, mail as never, config as never, notify as never);
  return { service, cancelled, cancelReasons, claimed, reminders, courierPushes, released, mails, rpcArgs: () => rpcArgs, rpcName: () => rpcName };
}

describe('orders waiting for a courier', () => {
  const settings = { no_courier_alert_min: 15, no_courier_cancel_min: 60 };

  it('flags what passed the first delay and cancels what passed the second', async () => {
    const h = stalledHarness({
      settings,
      staffEmail: 'ops@sougouba.ca',
      orders: [
        { order_id: 'old', waiting_min: 75, alerted: true },
        { order_id: 'new', waiting_min: 20, alerted: false, offers: 2 },
        { order_id: 'known', waiting_min: 30, alerted: true },
      ],
    });
    expect(await h.service.sweep()).toEqual({ alerted: 1, cancelled: 1 });
    expect(h.cancelled).toEqual(['old']);
    // Flagged once: the one already flagged is left alone.
    expect(h.claimed).toEqual(['new']);
    // Asks for what waited at least 15 minutes, and never reaches back past a day.
    expect(h.rpcArgs()).toEqual({ p_min_waiting_min: 15, p_max_waiting_min: 1440 });

    expect(h.mails).toHaveLength(1);
    expect(h.mails[0].to).toBe('ops@sougouba.ca');
    expect(h.mails[0].subject).toContain('sans livreur depuis 20 min');
    expect(h.mails[0].text).toContain('2 livreurs sollicités, aucun n’a accepté');
    expect(h.mails[0].text).toContain('annulée et remboursée automatiquement 60 minutes');
  });

  it('cancels nothing when automatic cancellation is switched off', async () => {
    const h = stalledHarness({
      settings: { no_courier_alert_min: 15, no_courier_cancel_min: 0 },
      staffEmail: 'ops@sougouba.ca',
      orders: [{ order_id: 'old', waiting_min: 500, alerted: false }],
    });
    expect(await h.service.sweep()).toEqual({ alerted: 1, cancelled: 0 });
    expect(h.cancelled).toEqual([]);
    expect(h.mails[0].text).toContain('L’annulation automatique est désactivée');
    expect(h.mails[0].text).toContain('aucun livreur à portée');
  });

  it('sends one email when two sweeps see the same order', async () => {
    const h = stalledHarness({
      settings,
      staffEmail: 'ops@sougouba.ca',
      orders: [{ order_id: 'a', waiting_min: 20, alerted: false }],
      claimedElsewhere: ['a'],
    });
    expect(await h.service.sweep()).toEqual({ alerted: 0, cancelled: 0 });
    expect(h.mails).toEqual([]);
  });

  it('still flags the order when nobody is configured to be emailed', async () => {
    const h = stalledHarness({ settings, orders: [{ order_id: 'a', waiting_min: 20, alerted: false }] });
    expect(await h.service.sweep()).toEqual({ alerted: 1, cancelled: 0 });
    expect(h.claimed).toEqual(['a']);
    expect(h.mails).toEqual([]);
  });

  it('does nothing against a database that does not have the two delays yet', async () => {
    for (const none of [null, {}, { no_courier_alert_min: 0, no_courier_cancel_min: 60 }]) {
      const h = stalledHarness({ settings: none, orders: [{ order_id: 'a', waiting_min: 900, alerted: false }] });
      expect(await h.service.sweep()).toEqual({ alerted: 0, cancelled: 0 });
      expect(h.cancelled).toEqual([]);
      expect(h.rpcArgs()).toBeNull();
    }
  });

  it('lists everything for the back office, with no age limit', async () => {
    const h = stalledHarness({ settings, orders: [{ order_id: 'ancient', waiting_min: 110_000, alerted: false }] });
    const list = await h.service.list();
    expect(list.alertAfterMin).toBe(15);
    expect(list.cancelAfterMin).toBe(60);
    expect(list.orders).toEqual([
      {
        orderId: 'ancient',
        vendorId: 'vendor-1',
        vendorName: 'Marché Teranga',
        customerName: 'Awa',
        totalCad: 29.13,
        waitingSince: '2026-11-24T14:00:00+00:00',
        waitingMin: 110_000,
        alerted: false,
        offers: 0,
      },
    ]);
    expect(h.rpcArgs()).toEqual({ p_min_waiting_min: 15, p_max_waiting_min: null });
    // Listing is a read: nothing is cancelled or flagged by looking.
    expect(h.cancelled).toEqual([]);
    expect(h.claimed).toEqual([]);
  });
});

describe('orders the shop has not answered', () => {
  const settings = { shop_confirm_remind_min: 3, shop_confirm_cancel_min: 10 };

  it('reminds the shop once after the first delay and cancels after the second', async () => {
    const h = stalledHarness({
      settings,
      orders: [
        { order_id: 'late', waiting_min: 11 },
        { order_id: 'waiting', waiting_min: 4 },
        { order_id: 'nudged', waiting_min: 6, reminded: true },
      ],
    });
    expect(await h.service.sweepUnanswered()).toEqual({ reminded: 1, cancelled: 1 });
    expect(h.cancelled).toEqual(['late']);
    expect(h.cancelReasons).toEqual(['shop_no_response']);
    // One reminder, to the order not yet reminded, saying how long it has left.
    expect(h.reminders).toEqual([{ orderId: 'waiting', minutesLeft: 6 }]);
    expect(h.claimed).toEqual(['waiting']);
    // From the earlier delay, and never further back than a day.
    expect(h.rpcName()).toBe('orders_awaiting_shop');
    expect(h.rpcArgs()).toEqual({ p_min_waiting_min: 3, p_max_waiting_min: 1440 });
  });

  it('rings the shop once when two sweeps see the same order', async () => {
    const h = stalledHarness({ settings, orders: [{ order_id: 'a', waiting_min: 4 }], claimedElsewhere: ['a'] });
    expect(await h.service.sweepUnanswered()).toEqual({ reminded: 0, cancelled: 0 });
    expect(h.reminders).toEqual([]);
  });

  it('only reminds when automatic cancellation is off, without a countdown', async () => {
    const h = stalledHarness({
      settings: { shop_confirm_remind_min: 3, shop_confirm_cancel_min: 0 },
      orders: [{ order_id: 'a', waiting_min: 500 }],
    });
    expect(await h.service.sweepUnanswered()).toEqual({ reminded: 1, cancelled: 0 });
    expect(h.cancelled).toEqual([]);
    expect(h.reminders).toEqual([{ orderId: 'a', minutesLeft: null }]);
  });

  it('only cancels when the reminder is off', async () => {
    const h = stalledHarness({
      settings: { shop_confirm_remind_min: 0, shop_confirm_cancel_min: 10 },
      orders: [{ order_id: 'late', waiting_min: 10 }],
    });
    expect(await h.service.sweepUnanswered()).toEqual({ reminded: 0, cancelled: 1 });
    expect(h.reminders).toEqual([]);
    expect(h.rpcArgs()).toEqual({ p_min_waiting_min: 10, p_max_waiting_min: 1440 });
  });

  it('does nothing with both switched off, or against a database without the two delays', async () => {
    for (const none of [{ shop_confirm_remind_min: 0, shop_confirm_cancel_min: 0 }, { no_courier_alert_min: 15, no_courier_cancel_min: 60 }, null]) {
      const h = stalledHarness({ settings: none, orders: [{ order_id: 'a', waiting_min: 900 }] });
      expect(await h.service.sweepUnanswered()).toEqual({ reminded: 0, cancelled: 0 });
      expect(h.cancelled).toEqual([]);
      expect(h.rpcArgs()).toBeNull();
    }
  });

  it('lists for the back office what the timer left alone, with no age limit', async () => {
    const h = stalledHarness({ settings, orders: [{ order_id: 'ancient', waiting_min: 55_000, reminded: false }] });
    const list = await h.service.listUnanswered();
    expect(list.remindAfterMin).toBe(3);
    expect(list.cancelAfterMin).toBe(10);
    expect(list.orders.map((o) => [o.orderId, o.waitingMin])).toEqual([['ancient', 55_000]]);
    // Past the point where it should have been cancelled — and looking changes nothing.
    expect(h.rpcArgs()).toEqual({ p_min_waiting_min: 10, p_max_waiting_min: null });
    expect(h.cancelled).toEqual([]);
    expect(h.reminders).toEqual([]);
  });
});

describe('a courier who accepted and has not come', () => {
  const settings = { courier_late_remind_min: 5, courier_late_release_min: 15 };
  const pickup = (order_id: string, late_min: number, extra: Record<string, unknown> = {}) => ({ order_id, courier_id: `courier-${order_id}`, late_min, ...extra });

  it('reminds once after the first delay and takes the run back after the second', async () => {
    const h = stalledHarness({
      settings,
      orders: [],
      pickups: [pickup('gone', 16), pickup('late', 7), pickup('nudged', 9, { reminded: true })],
    });
    expect(await h.service.sweepLatePickups()).toEqual({ reminded: 1, released: 1 });
    // Taken back through the courier's own hand-back function, as a no-show.
    expect(h.released).toEqual([{ p_order_id: 'gone', p_courier_id: 'courier-gone', p_reason: 'no_show', p_note: null }]);
    expect(h.courierPushes).toEqual([
      { orderId: 'gone', courierId: 'courier-gone', event: { kind: 'taken_back' } },
      // 15 - 7: how long the late one still has.
      { orderId: 'late', courierId: 'courier-late', event: { kind: 'late', minutesLeft: 8 } },
    ]);
    expect(h.claimed).toEqual(['late']);
    expect(h.rpcArgs()).toEqual({ p_min_late_min: 5, p_max_late_min: 1440 });
    // Nothing is cancelled: the order goes back to dispatch.
    expect(h.cancelled).toEqual([]);
  });

  it('leaves alone a run the courier reported a problem on', async () => {
    const h = stalledHarness({ settings, orders: [], pickups: [pickup('blocked', 40, { has_open_issue: true })] });
    expect(await h.service.sweepLatePickups()).toEqual({ reminded: 0, released: 0 });
    expect(h.released).toEqual([]);
    expect(h.courierPushes).toEqual([]);
  });

  it('lets a courier who picks up as the timer fires keep the run, and tells them nothing', async () => {
    const h = stalledHarness({ settings, orders: [], pickups: [pickup('justintime', 15)], pickedUpMeanwhile: ['justintime'] });
    expect(await h.service.sweepLatePickups()).toEqual({ reminded: 0, released: 0 });
    expect(h.courierPushes).toEqual([]);
  });

  it('reminds only once when two sweeps see the same run', async () => {
    const h = stalledHarness({ settings, orders: [], pickups: [pickup('late', 7)], claimedElsewhere: ['late'] });
    expect(await h.service.sweepLatePickups()).toEqual({ reminded: 0, released: 0 });
    expect(h.courierPushes).toEqual([]);
  });

  it('only reminds when taking back is off, and only takes back when the reminder is off', async () => {
    const remindOnly = stalledHarness({
      settings: { courier_late_remind_min: 5, courier_late_release_min: 0 },
      orders: [],
      pickups: [pickup('late', 300)],
    });
    expect(await remindOnly.service.sweepLatePickups()).toEqual({ reminded: 1, released: 0 });
    expect(remindOnly.courierPushes).toEqual([{ orderId: 'late', courierId: 'courier-late', event: { kind: 'late', minutesLeft: null } }]);
    expect(remindOnly.released).toEqual([]);

    const releaseOnly = stalledHarness({
      settings: { courier_late_remind_min: 0, courier_late_release_min: 15 },
      orders: [],
      pickups: [pickup('gone', 15), pickup('late', 14)],
    });
    expect(await releaseOnly.service.sweepLatePickups()).toEqual({ reminded: 0, released: 1 });
    expect(releaseOnly.rpcArgs()).toEqual({ p_min_late_min: 15, p_max_late_min: 1440 });
    expect(releaseOnly.released.map((r) => r.p_order_id)).toEqual(['gone']);
  });

  it('does nothing with both switched off, or against a database without the two delays', async () => {
    for (const none of [{ courier_late_remind_min: 0, courier_late_release_min: 0 }, { shop_confirm_remind_min: 3, shop_confirm_cancel_min: 10 }, null]) {
      const h = stalledHarness({ settings: none, orders: [], pickups: [pickup('gone', 900)] });
      expect(await h.service.sweepLatePickups()).toEqual({ reminded: 0, released: 0 });
      expect(h.released).toEqual([]);
      expect(h.rpcArgs()).toBeNull();
    }
  });

  it('lists for the back office what the timer left alone, with no age limit', async () => {
    const h = stalledHarness({ settings, orders: [], pickups: [pickup('ancient', 77_000, { has_open_issue: true })] });
    const list = await h.service.listLatePickups();
    expect(list.remindAfterMin).toBe(5);
    expect(list.releaseAfterMin).toBe(15);
    expect(list.pickups).toEqual([
      {
        orderId: 'ancient',
        courierId: 'courier-ancient',
        courierName: 'Karim',
        vendorId: 'vendor-1',
        vendorName: 'Marché Teranga',
        customerName: 'Awa',
        totalCad: 29.13,
        acceptedAt: '2026-11-24T14:00:00+00:00',
        dueAt: '2026-11-24T14:10:00+00:00',
        lateMin: 77_000,
        reminded: false,
        hasOpenIssue: true,
      },
    ]);
    expect(h.rpcArgs()).toEqual({ p_min_late_min: 15, p_max_late_min: null });
    expect(h.released).toEqual([]);
  });
});
