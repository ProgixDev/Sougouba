import { describe, expect, it } from 'vitest';

import { chatCopy } from '../notifications/messages.js';
import { sendOrderMessageSchema } from './dto/order.dto.js';
import { chatState } from './order-chat.service.js';
import { ORDER_STATUSES } from './order-status.js';

const courier = { userId: 'u-courier', fullName: 'Karim Benali' };

describe('when an order chat takes messages', () => {
  it('opens once a courier has the run and closes when the order ends', () => {
    const states = Object.fromEntries(ORDER_STATUSES.map((status) => [status, chatState({ status, courier })]));
    expect(states).toEqual({
      pending: 'waiting',
      confirmed: 'open',
      preparing: 'open',
      ready: 'open',
      out_for_delivery: 'open',
      delivered: 'closed',
      cancelled: 'closed',
    });
  });

  it('waits for a courier, and a finished order is closed either way', () => {
    for (const status of ORDER_STATUSES) {
      expect(chatState({ status, courier: null })).toBe(status === 'delivered' || status === 'cancelled' ? 'closed' : 'waiting');
    }
  });
});

describe('a chat message', () => {
  it('is trimmed and must say something', () => {
    expect(sendOrderMessageSchema.parse({ body: '  Je suis en bas  ' }).body).toBe('Je suis en bas');
    expect(sendOrderMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(sendOrderMessageSchema.safeParse({}).success).toBe(false);
  });

  it('is capped at the column limit', () => {
    expect(sendOrderMessageSchema.safeParse({ body: 'a'.repeat(1000) }).success).toBe(true);
    expect(sendOrderMessageSchema.safeParse({ body: 'a'.repeat(1001) }).success).toBe(false);
  });
});

describe('the chat push', () => {
  it('names the sender and keeps the body to a lock-screen line', () => {
    const push = chatCopy.newMessage({ name: 'Karim', text: 'x'.repeat(300) }, 'fr');
    expect(push.title).toBe('Message de Karim');
    expect(push.body.length).toBe(140);
    expect(chatCopy.newMessage({ name: '', text: 'Hi' }, 'en').title).toBe('New message');
  });
});
