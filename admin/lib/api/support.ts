import { apiGet, apiGetOrNull, apiPost, type Page } from './client';

export type SupportStatus = 'open' | 'escalated' | 'closed';
export type SupportRole = 'user' | 'assistant' | 'agent' | 'system';

/** One conversation as the inbox lists it. */
export interface SupportInboxItem {
  id: string;
  status: SupportStatus;
  customer: { id: string; fullName: string | null };
  escalatedAt: string | null;
  lastMessageAt: string;
  resolvedAt: string | null;
  lastMessage: { role: SupportRole; preview: string } | null;
  /** The customer wrote last: the team owes an answer. */
  awaitingTeam: boolean;
}

export interface SupportConversationDetail extends SupportInboxItem {
  customerEmail: string | null;
  resolvedByName: string | null;
  messages: { id: string; role: SupportRole; content: string; createdAt: string; authorName: string | null }[];
  recentOrders: { id: string; status: string; totalCad: number; createdAt: string; vendorName: string | null }[];
}

/** `escalated` is the inbox (oldest activity first); `closed` the resolved ones; `all` both. */
export async function listSupport(
  status: 'escalated' | 'closed' | 'all' = 'escalated',
  offset = 0,
  limit = 50
): Promise<Page<SupportInboxItem>> {
  return apiGet<Page<SupportInboxItem>>('/admin/support', { status, offset, limit });
}

export async function getSupportConversation(id: string): Promise<SupportConversationDetail | null> {
  return apiGetOrNull<SupportConversationDetail>(`/admin/support/${id}`);
}

/** Answers in the customer's own thread; they get a push. */
export async function replySupport(id: string, content: string): Promise<SupportConversationDetail> {
  return apiPost<SupportConversationDetail>(`/admin/support/${id}/reply`, { content });
}

export async function resolveSupport(id: string): Promise<SupportConversationDetail> {
  return apiPost<SupportConversationDetail>(`/admin/support/${id}/resolve`, {});
}
