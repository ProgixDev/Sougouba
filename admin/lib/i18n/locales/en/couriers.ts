import type { Shape } from '../../types';
import type { couriers as fr } from '../fr/couriers';

export const couriers: Shape<typeof fr> = {
  list: {
    title: 'Couriers',
    description: 'Approval queue, directory and fleet activity.',
    statuses: {
      pending: 'Pending',
      approved: 'Approved',
      suspended: 'Suspended',
      rejected: 'Rejected',
    },
    columns: {
      courier: 'Courier',
      vehicle: 'Vehicle',
      city: 'City',
      joined: 'Joined',
      status: 'Status',
    },
    kpi: {
      online: 'Online now',
      onlineHint: { one: 'out of {count} approved courier', other: 'out of {count} approved couriers' },
      deliveries: 'Deliveries · 30 days',
      deliveriesHint: '{amount} earned, tips included',
      deliveryTime: 'Average delivery time',
      deliveryTimeHint: 'From pickup to drop-off, 30 days',
      rating: 'Average rating',
      ratingHint: { one: '{count} pending application', other: '{count} pending applications' },
    },
    byDay: {
      title: 'Deliveries per day',
      subtitle: 'Last 14 days',
    },
    fleet: {
      title: 'Fleet',
      subtitle: 'Approved couriers by vehicle',
    },
    top: {
      title: 'Most active · 30 days',
      subtitle: 'Deliveries completed',
      value: { one: '{count} delivery', other: '{count} deliveries' },
    },
    searchPlaceholder: 'Search for a courier or a city…',
    emptyTitle: 'No couriers',
    emptyDescription: 'No courier matches this filter at the moment.',
  },
  detail: {
    notFound: 'Courier not found',
    actions: {
      approve: 'Approve',
      reject: 'Reject',
      suspend: 'Suspend',
    },
    toasts: {
      approved: '{name} has been approved.',
      rejected: '{name} has been rejected.',
      suspended: '{name} has been suspended.',
      failed: 'The decision could not be recorded.',
    },
    statusReason: 'Reason for the rejection / suspension',
    file: {
      title: 'Courier file',
      phone: 'Phone',
      vehicle: 'Vehicle',
      licence: 'Licence number',
      insurer: 'Insurer',
      policy: 'Insurance policy',
      expiry: 'Expiry',
      joinedOn: 'Joined on',
    },
    details: {
      title: 'Details',
      area: 'Area',
      rating: 'Rating',
      deliveries: 'Deliveries completed',
    },
    dialog: {
      rejectTitle: 'Reject this courier?',
      rejectDescription: 'The courier will not be able to accept deliveries. Give the reason — it helps the courier correct their application.',
      suspendTitle: 'Suspend this courier?',
      suspendDescription: 'The courier will be removed from the platform immediately. Give the reason for the suspension.',
    },
  },
};
