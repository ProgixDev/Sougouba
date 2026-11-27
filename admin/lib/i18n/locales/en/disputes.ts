import type { Shape } from '../../types';
import type { disputes as fr } from '../fr/disputes';

export const disputes: Shape<typeof fr> = {
  list: {
    title: 'Disputes',
    description: 'Customer complaints to sort, decide and refund.',
    tabs: {
      open: 'Open',
      answered: 'Answered',
      resolved: 'Resolved',
      rejected: 'Dismissed',
      all: 'All',
    },
    columns: {
      order: 'Order',
      customer: 'Customer',
      shop: 'Shop',
      reason: 'Reason',
      opened: 'Opened',
      status: 'Status',
    },
    kpis: {
      toHandle: 'To handle',
      toHandleHint: '{count} with a reply from the merchant',
      decided: 'Decided',
      decidedHint: '{resolved} in the customer’s favour · {rejected} dismissed',
      avgDecision: 'Average time to decision',
      opened30: '{count} opened in 30 days',
      refunded30: 'Refunded · 30 days',
      refundedHint: 'Following a dispute',
    },
    reasons: {
      title: 'Reasons',
      subtitle: 'All disputes, by reason given',
    },
    outcome: {
      title: 'Outcome',
      subtitle: 'Where disputes stand',
      merchantReplied: 'Merchant replied',
    },
    empty: {
      title: 'No disputes',
      description: 'No disputes match this filter right now.',
    },
  },
  detail: {
    notFound: 'Dispute not found',
    title: 'Dispute — {reason}',
    orderLink: 'Order #{id}',
    markResolved: 'Mark as resolved',
    rejectClaim: 'Dismiss the complaint',
    thread: {
      title: 'Complaint thread',
      customer: 'Customer',
      merchant: 'Merchant',
      adminDecision: 'Administrator — decision',
    },
    confirm: {
      resolveTitle: 'Mark this dispute as resolved?',
      rejectTitle: 'Dismiss this complaint?',
      description: 'Add a decision note — it stays in the order’s file for reference.',
      reject: 'Dismiss',
      noteLabel: 'Decision note',
    },
    toast: {
      resolved: 'Dispute marked as resolved.',
      rejected: 'Dispute marked as dismissed.',
    },
  },
};
