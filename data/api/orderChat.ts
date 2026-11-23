import { api } from '../http';
import type { ID } from '../types';

export type ChatSide = 'customer' | 'courier';

export interface OrderMessage {
  id: string;
  from: ChatSide;
  body: string;
  createdAt: string;
  /** When the other side first read it. */
  readAt: string | null;
}

export interface OrderThread {
  /**
   * `waiting`: no courier has accepted the run yet. `open`: messages go
   * through. `closed`: delivered or cancelled — the history stays readable.
   */
  state: 'waiting' | 'open' | 'closed';
  /** The other person, first name only. Null when not known yet. */
  counterpart: { name: string } | null;
  messages: OrderMessage[];
  /** Messages from the other side the caller has not read. */
  unread: number;
}

/**
 * The chat between a shopper and the courier carrying their order. The same
 * thread from either end: the shopper reaches it through the order, the
 * courier through the run — the API decides which side the caller is from
 * the token, so `side` only picks the route.
 */
function base(side: ChatSide, orderId: ID): string {
  return side === 'customer' ? `/orders/${orderId}/messages` : `/couriers/me/runs/${orderId}/messages`;
}

export async function getThread(side: ChatSide, orderId: ID): Promise<OrderThread> {
  return api<OrderThread>(base(side, orderId));
}

/** Sends one message and returns the whole thread. */
export async function sendMessage(side: ChatSide, orderId: ID, body: string): Promise<OrderThread> {
  return api<OrderThread>(base(side, orderId), { method: 'POST', body: { body } });
}

/** The thread is on screen: everything the other side sent is now read. */
export async function markRead(side: ChatSide, orderId: ID): Promise<void> {
  await api(`${base(side, orderId)}/read`, { method: 'POST' });
}
