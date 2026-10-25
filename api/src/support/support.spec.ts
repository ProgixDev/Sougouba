import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LOYALTY_RATES } from '../loyalty/loyalty-rules.js';
import { orderReference } from '../notifications/messages.js';
import { SUPPORT_EMAIL, supportInstructions } from './knowledge.js';
import { extractText, OpenAiClient } from './openai.client.js';

const order = {
  id: '1f0c8a52-6c2e-4f6b-9a51-2b7e3d1c9e01',
  status: 'out_for_delivery',
  createdAt: '2026-10-25T17:00:00.000Z',
  totalCad: 42.5,
  vendorName: 'Épicerie Dakar',
  itemCount: 3,
  courierAssigned: true,
  pickedUpAt: '2026-10-25T17:30:00.000Z',
  deliveredAt: null,
  disputeStatus: null,
};

describe('supportInstructions', () => {
  const text = supportInstructions({
    firstName: 'Awa',
    rates: DEFAULT_LOYALTY_RATES,
    orders: [order],
    now: new Date('2026-10-25T18:00:00.000Z'),
  });

  it("names the asker's order by the same reference the app shows", () => {
    expect(text).toContain(orderReference(order.id));
    expect(text).toContain('Épicerie Dakar');
    expect(text).toContain('en route avec le livreur');
  });

  it('carries the live rules rather than a frozen FAQ', () => {
    expect(text).toContain('Longueuil');
    expect(text).toContain('100 points = 1 $');
    expect(text).toContain('20 % du sous-total');
    expect(text).toContain('9,975 %');
  });

  it('tells the model it cannot act, and where a person is', () => {
    expect(text).toContain('Tu ne peux rien modifier');
    expect(text).toContain(SUPPORT_EMAIL);
  });

  it('says so when the account has no orders, instead of leaving the model to invent one', () => {
    const empty = supportInstructions({
      firstName: null,
      rates: DEFAULT_LOYALTY_RATES,
      orders: [],
      now: new Date(),
    });
    expect(empty).toContain('(aucune commande sur ce compte)');
  });

  it('mentions double points only while they run', () => {
    const on = {
      ...DEFAULT_LOYALTY_RATES,
      doublePointsActive: true,
      doublePointsEndsAt: '2026-10-26T00:00:00Z' as never,
    };
    expect(
      supportInstructions({
        firstName: null,
        rates: on,
        orders: [],
        now: new Date('2026-10-25T12:00:00Z'),
      }),
    ).toContain('points doublés');
    expect(
      supportInstructions({
        firstName: null,
        rates: on,
        orders: [],
        now: new Date('2026-10-27T12:00:00Z'),
      }),
    ).not.toContain('points doublés');
  });
});

describe('extractText', () => {
  it('reads the assistant message out of the Responses API output', () => {
    expect(
      extractText({
        output: [
          { type: 'reasoning' },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Votre commande arrive.' }],
          },
        ],
      }),
    ).toBe('Votre commande arrive.');
  });

  it('passes a refusal through rather than answering with nothing', () => {
    expect(
      extractText({
        output: [
          {
            type: 'message',
            content: [{ type: 'refusal', refusal: 'Je ne peux pas.' }],
          },
        ],
      }),
    ).toBe('Je ne peux pas.');
  });

  it('returns null for an empty answer', () => {
    expect(extractText({ output: [] })).toBeNull();
  });
});

describe('OpenAiClient without a key', () => {
  it('reports itself unconfigured and answers 503, so the app can ship before the key does', async () => {
    const client = new OpenAiClient({ get: () => undefined } as never);
    expect(client.configured).toBe(false);
    await expect(
      client.reply('x', [{ role: 'user', content: 'bonjour' }]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
