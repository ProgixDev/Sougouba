import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { one } from '../db/embed.js';
import { unwrap } from '../db/unwrap.js';
import { NotifyService } from '../notifications/notify.service.js';
import type { OrderStatus } from './order-status.js';

export type ChatSide = 'customer' | 'courier';
export type ChatState = 'waiting' | 'open' | 'closed';

/** The statuses in which a courier is on the way and there is something to say. */
const OPEN_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'ready', 'out_for_delivery'];

/**
 * A ceiling per order. A delivery needs a handful of messages; a thread this
 * long is a problem for support, not more chat, and an unbounded one is a way
 * to spam the other side's lock screen.
 */
export const MAX_MESSAGES_PER_ORDER = 200;

export interface OrderMessageView {
  id: string;
  from: ChatSide;
  body: string;
  createdAt: string;
  /** When the other side first read it. */
  readAt: string | null;
}

export interface OrderThreadView {
  /**
   * `waiting`: no courier has accepted the run yet. `open`: messages go
   * through. `closed`: delivered or cancelled — the history stays readable.
   */
  state: ChatState;
  /** The person at the other end — the courier for the shopper, the shopper for the courier. First name only. */
  counterpart: { name: string } | null;
  messages: OrderMessageView[];
  /** Messages from the other side not yet read by the caller. */
  unread: number;
}

type Person = { userId: string; fullName: string };
/** A PostgREST embed: an object, a one-element array, or nothing. */
type Embed<T> = T | T[] | null;

/** Who is asking, and who is at the other end — resolved once from the token, never from the request. */
export interface ThreadContext {
  orderId: string;
  side: ChatSide;
  status: OrderStatus;
  /** Null until a courier accepted the run. */
  courier: Person | null;
  customer: { userId: string; fullName: string | null };
}

/**
 * The chat between a shopper and the courier carrying their order.
 *
 * Replaces the tracking card's `sms:` link, which handed the shopper the
 * courier's real number for good. Here the conversation is scoped to one
 * order, neither side sees the other's number, and it stops taking messages
 * the moment the order is delivered or cancelled — the history stays readable.
 *
 * The merchant is deliberately not in it: what a shop has to say goes through
 * the order's status, as in every delivery app.
 */
@Injectable()
export class OrderChatService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notify: NotifyService
  ) {}

  /** The shopper's side. A 404 for an order that is not theirs. */
  async forCustomer(userId: string, orderId: string): Promise<ThreadContext> {
    const row = await unwrap<{
      status: OrderStatus;
      delivery: Embed<{ courier: Embed<Person> }>;
      customer: Embed<{ fullName: string | null }>;
    } | null>(
      this.db
        .from('orders')
        .select(
          `status,
           delivery:order_deliveries(courier:couriers(userId:user_id, fullName:full_name)),
           customer:profiles!orders_customer_id_profiles_id_fk(fullName:full_name)`
        )
        .eq('id', orderId)
        .eq('customer_id', userId)
        .maybeSingle()
    );
    if (!row) throw new NotFoundException('Order not found');
    return {
      orderId,
      side: 'customer',
      status: row.status,
      courier: one(one(row.delivery)?.courier),
      customer: { userId, fullName: one(row.customer)?.fullName ?? null },
    };
  }

  /** The courier's side. A 404 for a run they are not carrying, as everywhere else on their routes. */
  async forCourier(courierId: string, orderId: string): Promise<ThreadContext> {
    const row = await unwrap<{
      courier: Embed<Person>;
      order: Embed<{ status: OrderStatus; customerId: string }>;
    } | null>(
      this.db
        .from('order_deliveries')
        .select(
          `courier:couriers(userId:user_id, fullName:full_name),
           order:orders!inner(status, customerId:customer_id)`
        )
        .eq('order_id', orderId)
        .eq('courier_id', courierId)
        .maybeSingle()
    );
    const order = row ? one(row.order) : null;
    if (!row || !order) throw new NotFoundException('Run not found');
    const profile = await unwrap<{ fullName: string | null } | null>(
      this.db.from('profiles').select('fullName:full_name').eq('id', order.customerId).maybeSingle()
    );
    return {
      orderId,
      side: 'courier',
      status: order.status,
      courier: one(row.courier),
      customer: { userId: order.customerId, fullName: profile?.fullName ?? null },
    };
  }

  async thread(ctx: ThreadContext): Promise<OrderThreadView> {
    const rows = await unwrap<{ id: string; from: ChatSide; body: string; createdAt: string; readAt: string | null }[]>(
      this.db
        .from('order_messages')
        .select('id, from:sender_role, body, createdAt:created_at, readAt:read_at')
        .eq('order_id', ctx.orderId)
        .order('created_at', { ascending: true })
    );
    const other = ctx.side === 'customer' ? ctx.courier?.fullName : ctx.customer.fullName;
    return {
      state: chatState(ctx),
      counterpart: other ? { name: firstName(other) } : null,
      messages: rows,
      unread: rows.filter((m) => m.from !== ctx.side && !m.readAt).length,
    };
  }

  async send(ctx: ThreadContext, body: string): Promise<OrderThreadView> {
    const state = chatState(ctx);
    if (state !== 'open') {
      throw new ConflictException(
        state === 'waiting' ? 'Aucun livreur n’a encore accepté cette commande' : 'Cette commande est terminée : la conversation est fermée'
      );
    }

    const { count, error } = await this.db
      .from('order_messages')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', ctx.orderId);
    if (error) throw error;
    if ((count ?? 0) >= MAX_MESSAGES_PER_ORDER) {
      throw new ConflictException('Trop de messages pour cette commande. Contactez le support si besoin.');
    }

    await unwrap(this.db.from('order_messages').insert({ order_id: ctx.orderId, sender_role: ctx.side, body }));

    // `open` guarantees a courier, so both ends are known here.
    const recipient = ctx.side === 'customer' ? ctx.courier!.userId : ctx.customer.userId;
    const senderName = firstName((ctx.side === 'customer' ? ctx.customer.fullName : ctx.courier!.fullName) ?? '');
    const [view] = await Promise.all([
      this.thread(ctx),
      this.notify.orderMessage({ orderId: ctx.orderId, to: ctx.side === 'customer' ? 'courier' : 'customer', recipient, senderName, body }),
    ]);
    return view;
  }

  /** The caller has the thread on screen: everything the other side sent is now read. */
  async markRead(ctx: ThreadContext): Promise<{ ok: true }> {
    await unwrap(
      this.db
        .from('order_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('order_id', ctx.orderId)
        .eq('sender_role', ctx.side === 'customer' ? 'courier' : 'customer')
        .is('read_at', null)
    );
    return { ok: true };
  }
}

export function chatState(ctx: Pick<ThreadContext, 'status' | 'courier'>): ChatState {
  if (ctx.status === 'delivered' || ctx.status === 'cancelled') return 'closed';
  return ctx.courier !== null && OPEN_STATUSES.includes(ctx.status) ? 'open' : 'waiting';
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}
