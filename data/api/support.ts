import { api } from '../http';

export interface SupportMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface SupportConversation {
  /** False until the API has an OpenAI key — the screen shows "bientôt disponible" rather than a chat box. */
  available: boolean;
  conversationId: string | null;
  messages: SupportMessage[];
}

/**
 * The shopper's conversation with the support assistant. Always "the current
 * one": the API keeps one open conversation per account and answers from the
 * token, so there is no id here to get wrong.
 */
export async function getConversation(): Promise<SupportConversation> {
  return api<SupportConversation>('/support/conversations/current');
}

/** Sends one message and returns the whole thread, the assistant's answer included. */
export async function sendMessage(content: string): Promise<SupportConversation> {
  return api<SupportConversation>('/support/conversations/current/messages', { method: 'POST', body: { content } });
}

/** "Nouvelle conversation". */
export async function closeConversation(): Promise<SupportConversation> {
  return api<SupportConversation>('/support/conversations/current/close', { method: 'POST' });
}
