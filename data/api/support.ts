import { api } from '../http';

export interface SupportMessage {
  id: string;
  /** `agent`: a reply from a person on the Sougouba team, once the conversation was handed to them. */
  role: 'user' | 'assistant' | 'agent';
  content: string;
  createdAt: string;
}

export interface SupportConversation {
  /** False until the API has an OpenAI key — the screen shows "bientôt disponible" rather than a chat box. */
  available: boolean;
  conversationId: string | null;
  /**
   * `escalated`: handed to the team — messages reach a person, not the
   * assistant, and the chat works even when `available` is false.
   */
  status: 'open' | 'escalated' | null;
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

/**
 * "Parler à l'équipe": the conversation, history included, goes to the back
 * office's inbox. Works with no conversation yet, and with no assistant.
 */
export async function escalate(): Promise<SupportConversation> {
  return api<SupportConversation>('/support/conversations/current/escalate', { method: 'POST' });
}

/** "Nouvelle conversation". */
export async function closeConversation(): Promise<SupportConversation> {
  return api<SupportConversation>('/support/conversations/current/close', { method: 'POST' });
}
