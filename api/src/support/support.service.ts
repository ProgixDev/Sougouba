import { ConflictException, Inject, Injectable } from '@nestjs/common';

import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { unwrap } from '../db/unwrap.js';
import { SettingsService } from '../loyalty/settings.service.js';
import { supportInstructions, type OrderFact } from './knowledge.js';
import { OpenAiClient, type ChatTurn } from './openai.client.js';

/** How many of the asker's orders the assistant can see — enough for "where is my order" and "that one last week". */
const RECENT_ORDERS = 5;

/** The model gets the tail of the conversation, not all of it: cost grows with every turn otherwise. */
const HISTORY_WINDOW = 16;

/**
 * A ceiling per conversation. Past it the shopper is asked to start a new one
 * — a conversation that long is a person who needs a human, and an unbounded
 * one is an unbounded bill.
 */
const MAX_USER_MESSAGES = 30;

export interface SupportMessageView {
  id: string;
  /** `agent` is a reply from the Sougouba team, once the conversation was handed to them. */
  role: 'user' | 'assistant' | 'agent';
  content: string;
  createdAt: string;
}

export interface SupportConversationView {
  /** False until `OPENAI_API_KEY` is set — the app shows "bientôt disponible" instead of a chat box. */
  available: boolean;
  conversationId: string | null;
  /**
   * `escalated`: handed to the team — messages go to a person, not the
   * assistant, so the chat works even when `available` is false. Null when
   * there is no open conversation.
   */
  status: 'open' | 'escalated' | null;
  messages: SupportMessageView[];
}

type OpenConversation = { id: string; status: 'open' | 'escalated' };

/**
 * The AI support assistant (devis: "Assistant IA de support client").
 *
 * One open conversation per shopper at a time, kept in `support_conversations`
 * / `support_messages`. Every turn the model is given the platform's facts and
 * **only the asker's own** recent orders, looked up here by the authenticated
 * id — never by anything the shopper typed. That is what makes "tell me about
 * order #1234" safe: an order that is not theirs is simply not in what the
 * model was shown.
 *
 * The assistant can explain but cannot act. It has no tools: no cancellation,
 * no refund, no address change. Anything that needs a decision goes to the
 * dispute flow or to a person.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly openai: OpenAiClient,
    private readonly settings: SettingsService,
  ) {}

  async current(userId: string): Promise<SupportConversationView> {
    return this.view(await this.openConversation(userId));
  }

  /**
   * "Parler à un membre de l'équipe": the conversation goes to the back
   * office's inbox, history included, and from here the customer's messages
   * reach a person instead of the assistant. Works with no conversation yet
   * (one is opened, already escalated) and when the assistant is not
   * configured. Asking twice changes nothing.
   */
  async escalate(userId: string): Promise<SupportConversationView> {
    const existing = await this.openConversation(userId);
    const now = new Date().toISOString();
    if (!existing) {
      const created = await unwrap<OpenConversation>(
        this.db
          .from('support_conversations')
          .insert({ customer_id: userId, status: 'escalated', escalated_at: now, last_message_at: now })
          .select('id, status')
          .single(),
      );
      return this.view(created);
    }
    if (existing.status === 'escalated') return this.view(existing);
    await unwrap(
      this.db
        .from('support_conversations')
        .update({ status: 'escalated', escalated_at: now, last_message_at: now })
        .eq('id', existing.id)
        .eq('status', 'open'),
    );
    return this.view({ ...existing, status: 'escalated' });
  }

  /**
   * The shopper says something; the assistant answers.
   *
   * Nothing is stored until the model has answered: a turn that failed at
   * OpenAI leaves no orphaned question behind for the next turn to answer out
   * of order. The shopper still sees the error and can resend.
   */
  async send(
    userId: string,
    content: string,
  ): Promise<SupportConversationView> {
    const existing = await this.openConversation(userId);

    // Handed to the team: stored for a person to read, no model call, and no
    // cap — the cap exists for the model's bill.
    if (existing?.status === 'escalated') {
      const sentAt = new Date().toISOString();
      await unwrap(
        this.db
          .from('support_messages')
          .insert({ conversation_id: existing.id, role: 'user', content, created_at: sentAt }),
      );
      await unwrap(
        this.db.from('support_conversations').update({ last_message_at: sentAt }).eq('id', existing.id),
      );
      return this.view(existing);
    }

    const history = existing ? await this.messages(existing.id) : [];

    if (history.filter((m) => m.role === 'user').length >= MAX_USER_MESSAGES) {
      throw new ConflictException(
        'Cette conversation est terminée. Commencez-en une nouvelle.',
      );
    }

    const [profile, rates, orders] = await Promise.all([
      unwrap<{ fullName: string } | null>(
        this.db
          .from('profiles')
          .select('fullName:full_name')
          .eq('id', userId)
          .maybeSingle(),
      ),
      this.settings.loyaltyRates(),
      this.recentOrders(userId),
    ]);

    const instructions = supportInstructions({
      firstName: profile?.fullName?.trim().split(/\s+/)[0] || null,
      rates,
      orders,
      now: new Date(),
    });
    const turns: ChatTurn[] = [
      ...history
        // The model only ever sees its own side and the customer's.
        .filter((m): m is SupportMessageView & { role: 'user' | 'assistant' } => m.role !== 'agent')
        .slice(-HISTORY_WINDOW)
        .map(({ role, content: text }) => ({ role, content: text })),
      { role: 'user', content },
    ];

    const answer = await this.openai.reply(instructions, turns);

    const conversationId =
      existing?.id ??
      (
        await unwrap<{ id: string }>(
          this.db
            .from('support_conversations')
            .insert({ customer_id: userId })
            .select('id')
            .single(),
        )
      ).id;

    // Two rows, one insert, with the answer stamped after the question so the
    // thread reads in order even when both land in the same millisecond.
    const askedAt = new Date();
    await unwrap(
      this.db.from('support_messages').insert([
        {
          conversation_id: conversationId,
          role: 'user',
          content,
          created_at: askedAt.toISOString(),
        },
        {
          conversation_id: conversationId,
          role: 'assistant',
          content: answer,
          created_at: new Date(askedAt.getTime() + 1).toISOString(),
        },
      ]),
    );

    await unwrap(
      this.db
        .from('support_conversations')
        .update({ last_message_at: new Date(askedAt.getTime() + 1).toISOString() })
        .eq('id', conversationId),
    );

    return this.view({ id: conversationId, status: 'open' });
  }

  /** "Nouvelle conversation". The old one is kept, closed — it is the shopper's history, not ours to delete. */
  async close(userId: string): Promise<SupportConversationView> {
    await unwrap(
      this.db
        .from('support_conversations')
        .update({ status: 'closed' })
        .eq('customer_id', userId)
        .neq('status', 'closed'),
    );
    return this.view(null);
  }

  // ──────────────────────────────────────────────────────────────────────────

  private async view(conversation: OpenConversation | null): Promise<SupportConversationView> {
    return {
      available: this.openai.configured,
      conversationId: conversation?.id ?? null,
      status: conversation?.status ?? null,
      messages: conversation ? await this.messages(conversation.id) : [],
    };
  }

  private async openConversation(
    userId: string,
  ): Promise<OpenConversation | null> {
    return unwrap<OpenConversation | null>(
      this.db
        .from('support_conversations')
        .select('id, status')
        .eq('customer_id', userId)
        .neq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
  }

  private async messages(
    conversationId: string,
  ): Promise<SupportMessageView[]> {
    const rows = await unwrap<SupportMessageView[]>(
      this.db
        .from('support_messages')
        .select('id, role, content, createdAt:created_at')
        .eq('conversation_id', conversationId)
        .in('role', ['user', 'assistant', 'agent'])
        .order('created_at', { ascending: true }),
    );
    return rows;
  }

  /** The asker's own orders, newest first — keyed on the authenticated id and nothing else. */
  private async recentOrders(userId: string): Promise<OrderFact[]> {
    const rows = await unwrap<
      {
        id: string;
        status: string;
        createdAt: string;
        totalCad: string | number;
        vendor: { name: string } | null;
        items: { qty: number }[];
        delivery: {
          pickedUpAt: string | null;
          deliveredAt: string | null;
        } | null;
        dispute: { status: string } | null;
      }[]
    >(
      this.db
        .from('orders')
        .select(
          `id, status, createdAt:created_at, totalCad:total_cad,
           vendor:vendors(name), items:order_items(qty),
           delivery:order_deliveries(pickedUpAt:picked_up_at, deliveredAt:delivered_at),
           dispute:disputes(status)`,
        )
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
        .limit(RECENT_ORDERS),
    );

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      totalCad: Number(row.totalCad),
      vendorName: row.vendor?.name ?? null,
      itemCount: row.items.reduce((sum, line) => sum + line.qty, 0),
      courierAssigned: !!row.delivery,
      pickedUpAt: row.delivery?.pickedUpAt ?? null,
      deliveredAt: row.delivery?.deliveredAt ?? null,
      disputeStatus: row.dispute?.status ?? null,
    }));
  }
}
