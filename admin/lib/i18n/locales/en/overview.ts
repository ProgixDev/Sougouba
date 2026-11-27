import type { Shape } from '../../types';
import type { overview as fr } from '../fr/overview';

export const overview: Shape<typeof fr> = {
  title: 'Platform overview',
  description: 'Activity, revenue and queues, at a glance.',
  // The period buttons: 7, 30 and 90.
  rangeDays: '{count} days',
  stats: {
    gmv: 'GMV',
    orders: 'Orders',
    commissionRevenue: 'Commission revenue',
    approvedMerchants: 'Approved merchants',
    approvedCouriers: 'Approved couriers',
    pendingApproval: 'Awaiting approval',
  },
  charts: {
    gmvOverTime: 'GMV over time',
    topMerchants: 'Top merchants (revenue)',
  },
  queues: {
    title: 'Open disputes & incidents',
    disputes: 'Customer disputes',
    courierIssues: 'Courier incidents',
  },
  ordersByVertical: 'Orders by sector',
};
