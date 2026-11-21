import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';

import type { Page } from '../catalog/dto/query.dto.js';
import type { Db } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { one } from '../db/embed.js';
import { unwrap, unwrapRpc } from '../db/unwrap.js';
import { NotifyService } from '../notifications/notify.service.js';
import type { SupportQuery } from './dto/admin.dto.js';

type MessageRole = 'user' | 'assistant' | 'agent' | 'system';

/** What the inbox shows per conversation. */
export interface SupportInboxItem {
  id: string;
  status: 'open' | 'escalated' | 'closed';
  customer: { id: string; fullName: string | null };
  escalatedAt: string | null;
  lastMessageAt: string;
  resolvedAt: string | null;
  /** The newest message, shortened — enough to triage without opening it. */
  lastMessage: { role: MessageRole; preview: string } | null;
  /** True when the customer wrote last: the team owes an answer. */
  awaitingTeam: boolean;
}

export interface SupportConversationDetail extends SupportInboxItem {
  customerEmail: string | null;
  resolvedByName: string | null;
  messages: {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    /** For `agent` messages: which administrator wrote it. */
    authorName: string | null;
  }[];
  /** The customer's latest orders — most questions are about one of them. */
  recentOrders: { id: string; status: string; totalCad: number; createdAt: string; vendorName: string | null }[];
}

const NOT_FOUND = 'SGB05';
const NOT_WAITING = 'SGB06';
const PREVIEW_LENGTH = 140;
const RECENT_ORDERS = 5;

/**
 * The back office's support inbox: conversations a customer handed to the
 * team (`escalated`), and the closed ones for reference.
 *
 * Replies and resolutions go through `admin_support_reply` and
 * `admin_support_resolve`, which write the change and its audit line in one
 * transaction. The customer is pushed after a reply — a failed push fails
 * nothing.
 */
@Injectable()
export class SupportAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly notify: NotifyService
  ) {}

  /** Waiting first means oldest activity first within `escalated`, so nobody is left at the bottom. */
  async list(query: SupportQuery): Promise<Page<SupportInboxItem>> {
    let q = this.db
      .from('support_conversations')
      .select(
        `id, status, escalatedAt:escalated_at, lastMessageAt:last_message_at, resolvedAt:resolved_at,
         customer:profiles!support_conversations_customer_id_profiles_id_fk(id, fullName:full_name)`,
        { count: 'exact' }
      );
    q = query.status === 'all' ? q.neq('status', 'open') : q.eq('status', query.status);
    const { data, count, error } = await q
      .order('last_message_at', { ascending: query.status === 'escalated' })
      .range(query.offset, query.offset + query.limit - 1);
    if (error) throw new InternalServerErrorException('Database request failed');

    const rows = (data ?? []) as Record<string, unknown>[];
    const last = await this.lastMessages(rows.map((r) => r.id as string));
    return {
      items: rows.map((row) => this.item(row, last.get(row.id as string) ?? null)),
      total: count ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async detail(id: string): Promise<SupportConversationDetail> {
    const row = await unwrap<Record<string, unknown> | null>(
      this.db
        .from('support_conversations')
        .select(
          `id, status, escalatedAt:escalated_at, lastMessageAt:last_message_at, resolvedAt:resolved_at,
           resolvedBy:resolved_by,
           customer:profiles!support_conversations_customer_id_profiles_id_fk(id, fullName:full_name)`
        )
        .eq('id', id)
        .maybeSingle()
    );
    if (!row) throw new NotFoundException('Conversation not found');
    const customer = one<{ id: string; fullName: string | null }>(row.customer as never);

    const [messages, auth, orders] = await Promise.all([
      unwrap<{ id: string; role: MessageRole; content: string; createdAt: string; authorId: string | null }[]>(
        this.db
          .from('support_messages')
          .select('id, role, content, createdAt:created_at, authorId:author_id')
          .eq('conversation_id', id)
          .order('created_at', { ascending: true })
      ),
      customer ? unwrap<{ email: string | null }[]>(this.db.rpc('admin_auth_users', { p_ids: [customer.id] })) : [],
      customer
        ? unwrap<{ id: string; status: string; totalCad: number | string; createdAt: string; vendor: unknown }[]>(
            this.db
              .from('orders')
              .select('id, status, totalCad:total_cad, createdAt:created_at, vendor:vendors(name)')
              .eq('customer_id', customer.id)
              .order('created_at', { ascending: false })
              .limit(RECENT_ORDERS)
          )
        : [],
    ]);

    // Administrators' names, for the agent messages and the resolution line.
    const adminIds = [
      ...new Set([...messages.map((m) => m.authorId), row.resolvedBy as string | null].filter((v): v is string => !!v)),
    ];
    const names = adminIds.length
      ? new Map(
          (
            await unwrap<{ id: string; fullName: string | null }[]>(
              this.db.from('profiles').select('id, fullName:full_name').in('id', adminIds)
            )
          ).map((p) => [p.id, p.fullName])
        )
      : new Map<string, string | null>();

    const lastMessage = messages.at(-1) ?? null;
    return {
      ...this.item(row, lastMessage),
      customerEmail: auth[0]?.email ?? null,
      resolvedByName: row.resolvedBy ? (names.get(row.resolvedBy as string) ?? null) : null,
      messages: messages.map(({ authorId, ...m }) => ({ ...m, authorName: authorId ? (names.get(authorId) ?? null) : null })),
      recentOrders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        totalCad: Number(o.totalCad),
        createdAt: o.createdAt,
        vendorName: one<{ name: string }>(o.vendor as never)?.name ?? null,
      })),
    };
  }

  async reply(adminId: string, id: string, content: string): Promise<SupportConversationDetail> {
    await unwrapRpc<string>(
      this.db.rpc('admin_support_reply', { p_admin_id: adminId, p_conversation_id: id, p_content: content }),
      (error) => this.refusal(error.code)
    );
    const detail = await this.detail(id);
    await this.notify.supportReplied(detail.customer.id);
    return detail;
  }

  async resolve(adminId: string, id: string): Promise<SupportConversationDetail> {
    await unwrapRpc<void>(
      this.db.rpc('admin_support_resolve', { p_admin_id: adminId, p_conversation_id: id }),
      (error) => this.refusal(error.code)
    );
    return this.detail(id);
  }

  private refusal(code: string): never {
    if (code === NOT_FOUND) throw new NotFoundException('Conversation not found');
    if (code === NOT_WAITING) {
      throw new BadRequestException('Cette conversation n’attend pas de réponse de l’équipe (déjà résolue, ou encore avec l’assistant).');
    }
    throw new InternalServerErrorException('Database request failed');
  }

  /** One query for every conversation's newest message, not one per row. */
  private async lastMessages(ids: string[]) {
    const latest = new Map<string, { role: MessageRole; content: string }>();
    if (ids.length === 0) return latest;
    const rows = await unwrap<{ conversationId: string; role: MessageRole; content: string }[]>(
      this.db
        .from('support_messages')
        .select('conversationId:conversation_id, role, content')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
    );
    for (const row of rows) if (!latest.has(row.conversationId)) latest.set(row.conversationId, row);
    return latest;
  }

  private item(
    row: Record<string, unknown>,
    last: { role: MessageRole; content: string } | null
  ): SupportInboxItem {
    const customer = one<{ id: string; fullName: string | null }>(row.customer as never);
    return {
      id: row.id as string,
      status: row.status as SupportInboxItem['status'],
      customer: { id: customer?.id ?? '', fullName: customer?.fullName ?? null },
      escalatedAt: (row.escalatedAt as string | null) ?? null,
      lastMessageAt: row.lastMessageAt as string,
      resolvedAt: (row.resolvedAt as string | null) ?? null,
      lastMessage: last
        ? {
            role: last.role,
            preview: last.content.length > PREVIEW_LENGTH ? `${last.content.slice(0, PREVIEW_LENGTH)}…` : last.content,
          }
        : null,
      awaitingTeam: row.status === 'escalated' && (last === null || last.role === 'user'),
    };
  }
}
