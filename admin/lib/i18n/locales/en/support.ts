import type { Shape } from '../../types';
import type { support as fr } from '../fr/support';

export const support: Shape<typeof fr> = {
  title: 'Support',
  // Shown in place of the customer's name when the account has none.
  customerFallback: 'Customer',
  status: {
    resolved: 'Resolved',
    awaitingTeam: 'Reply needed',
    answered: 'Answered',
  },

  // ── /support: the inbox ───────────────────────────────────────────────────
  list: {
    description: 'Conversations handed from the assistant to the team. Your reply arrives in the customer’s app.',
    tabs: {
      escalated: 'To handle',
      closed: 'Resolved',
      all: 'All',
    },
    // Who wrote the last message, before its preview: "Customer: Hello…".
    roles: {
      user: 'Customer',
      assistant: 'Assistant',
      agent: 'Team',
    },
    preview: '{role}: {preview}',
    columns: {
      customer: 'Customer',
      lastMessage: 'Last message',
      activity: 'Activity',
      status: 'Status',
    },
    noMessage: 'No messages yet',
    kpi: {
      waiting: 'Waiting for the team',
      waitingHint: 'Conversations to handle',
      resolved: 'Resolved · 30 d',
      resolvedHint: '{count} handed to the team over the period',
      resolutionTime: 'Average resolution time',
      resolutionTimeHint: 'From the request for a person to resolution',
      assistant: 'Settled by the assistant · 30 d',
      assistantHint: '{conversations} conversations, {messages} customer messages',
    },
    empty: {
      escalatedTitle: 'No conversations waiting',
      escalatedBody: 'When a customer asks to speak to the team, their conversation appears here.',
      title: 'No conversations',
      body: 'No conversation matches this filter.',
    },
  },

  // ── /support/[id]: one conversation ───────────────────────────────────────
  detail: {
    notFound: 'Conversation not found',
    escalatedOn: 'Handed to the team on {date}',
    resolvedOn: 'Resolved on {date}',
    resolvedOnBy: 'Resolved on {date} by {name}',
    resolve: 'Resolve',
    thread: 'Conversation',
    noMessages: 'The customer asked for the team before writing anything. You can write to them first.',
    replyTo: 'Reply to {name}',
    replyPlaceholder: 'Your reply — the customer receives it in the app, with a notification.',
    sending: 'Sending…',
    readOnly: 'Read-only — your role does not allow replying to support.',
    closedNote: 'Conversation resolved. If the customer writes again, a new conversation starts.',
    customer: 'Customer',
    recentOrders: 'Recent orders',
    noOrders: 'No orders.',
    authors: {
      assistant: 'AI assistant',
      team: 'Sougouba team',
      system: 'System',
    },
    toasts: {
      replySent: 'Reply sent.',
      replyFailed: 'Could not send.',
      resolved: 'Conversation resolved.',
      resolveFailed: 'Could not complete the action.',
    },
    confirm: {
      title: 'Resolve this conversation?',
      description: 'It leaves the “To handle” list. If the customer writes again, a new conversation starts with the assistant.',
    },
  },
};
