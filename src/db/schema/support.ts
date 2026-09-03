import { relations } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './identity.js';

export const supportConversationStatusEnum = pgEnum('support_conversation_status', [
  'open',
  'escalated',
  'closed',
]);
export const supportMessageRoleEnum = pgEnum('support_message_role', ['user', 'assistant', 'system']);

/**
 * The AI support assistant's chat history (devis: "Assistant IA de support
 * client — OpenAI GPT"). Scope is still open — see "Confirm before Phase 0"
 * #5 in docs/BACKEND-BUILD-PHASES.md — this is a minimal shape that holds
 * together regardless of how that scoping lands.
 */
export const supportConversations = pgTable(
  'support_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id').notNull().references(() => profiles.id),
    status: supportConversationStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('support_conversations_customer_id_idx').on(t.customerId)]
);

export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => supportConversations.id, { onDelete: 'cascade' }),
    role: supportMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('support_messages_conversation_id_idx').on(t.conversationId)]
);

export const supportConversationsRelations = relations(supportConversations, ({ one, many }) => ({
  customer: one(profiles, { fields: [supportConversations.customerId], references: [profiles.id] }),
  messages: many(supportMessages),
}));
