import type { Shape } from '../../types';
import type { status as fr } from '../fr/status';

export const status: Shape<typeof fr> = {
  vendor: {
    pending: 'Pending',
    approved: 'Approved',
    suspended: 'Suspended',
    rejected: 'Rejected',
    subscription_hold: 'Subscription unpaid',
  },
  order: {
    pending: 'Pending',
    confirmed: 'Confirmed',
    preparing: 'Being prepared',
    ready: 'Ready',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  },
  dispute: {
    open: 'Open',
    answered: 'Answered',
    resolved: 'Resolved',
    rejected: 'Dismissed',
  },
  courierIssue: {
    open: 'Open',
    resolved: 'Resolved',
  },
  disputeReason: {
    missing_items: 'Missing items',
    wrong_order: 'Wrong order',
    quality: 'Quality',
    late: 'Late',
    other: 'Other',
  },
  cancelledBy: {
    customer: 'Cancelled by the customer',
    merchant: 'Cancelled by the merchant',
    admin: 'Cancelled by the Sougouba team',
    system: 'Cancelled automatically',
    unknown: 'Cancelled',
  },
  cancelReason: {
    changed_mind: 'Changed their mind',
    ordered_by_mistake: 'Ordered by mistake',
    wrong_address: 'Wrong delivery address',
    wrong_items: 'Wanted to change the order',
    too_long: 'The shop was slow to respond',
    other: 'Other',
    no_courier: 'No courier available',
    shop_no_response: 'The shop did not respond in time',
  },
  releaseReason: {
    vehicle_problem: 'Vehicle problem',
    too_far: 'Too far',
    shop_delay: 'Order not ready',
    personal: 'Personal reason',
    other: 'Other',
    order_cancelled: 'Order cancelled',
    no_show: 'Did not come to pick up the order',
  },
  courierIssueReason: {
    customer_absent: 'Customer absent',
    wrong_address: 'Wrong address',
    access_problem: 'Access problem',
    shop_not_ready: 'Shop not ready',
    order_incomplete: 'Incomplete order',
    other: 'Other',
  },
  vehicle: {
    bike: 'Bicycle',
    scooter: 'Scooter',
    car: 'Car',
  },
};
