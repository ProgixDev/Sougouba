import type { Shape } from '../../types';
import type { courierIssues as fr } from '../fr/courierIssues';

export const courierIssues: Shape<typeof fr> = {
  list: {
    title: 'Courier incidents',
    description: 'Problems reported by couriers during a run.',
    tabs: {
      open: 'Open',
      resolved: 'Resolved',
      all: 'All',
    },
    columns: {
      order: 'Order',
      courier: 'Courier',
      shop: 'Shop',
      reason: 'Reason',
      reported: 'Reported',
      status: 'Status',
    },
    kpis: {
      open: 'Open',
      openHint: 'A courier is waiting for a decision',
      resolved: 'Resolved',
      reported30: '{count} reported in 30 days',
      avgTime: 'Average time',
      avgTimeHint: 'From report to resolution',
    },
    reasons: {
      title: 'Reasons',
      subtitle: 'All incidents, by cause',
    },
    empty: {
      title: 'No incidents',
      description: 'No incidents match this filter right now.',
    },
  },
  detail: {
    notFound: 'Incident not found',
    title: 'Incident — {reason}',
    unassignedCourier: 'No courier assigned',
    orderLink: 'Order #{id}',
    markResolved: 'Mark as resolved',
    report: 'Courier’s report',
    resolvedOn: 'Resolved on {date}',
    confirm: {
      title: 'Mark this incident as resolved?',
      description: 'Explain what was done — the note is added to the report and stays on record.',
      noteLabel: 'Resolution note',
    },
    resolved: 'Incident marked as resolved.',
  },
};
