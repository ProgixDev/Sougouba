import type { Widen } from '../../types';
import type { domain as reference } from '../fr/domain';
import { plural } from '../plural';

export const domain: Widen<typeof reference> = {
  orderStatus: {
    pending: 'Pending',
    confirmed: 'Confirmed',
    preparing: 'Preparing',
    ready: 'Ready',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  },
  orderAdvance: {
    pending: 'Accept order',
    confirmed: 'Start preparing',
    preparing: 'Mark as ready',
    ready: 'Hand to courier',
    out_for_delivery: 'Mark as delivered',
  },
  courierAdvance: {
    ready: 'I picked up the order',
    out_for_delivery: 'Confirm delivery',
  },
  order: {
    itemCount: plural({ one: '%{count} item', other: '%{count} items' }),
  },
  disputeReason: {
    missing_items: 'Missing items',
    wrong_order: 'Wrong order',
    quality: 'Product quality',
    late: 'Late delivery',
    other: 'Other',
  },
  dispute: {
    answered: '%{reason} · answered',
  },
  cancelReason: {
    changed_mind: 'I changed my mind',
    ordered_by_mistake: 'Ordered by mistake',
    wrong_address: 'Wrong delivery address',
    wrong_items: 'I want to change my order',
    too_long: 'The shop is slow to answer',
    other: 'Other',
  },
  releaseReason: {
    vehicle_problem: 'Vehicle problem',
    too_far: 'Too far for me',
    shop_delay: 'The order is not ready',
    personal: 'Something came up',
    other: 'Other',
  },
  cancelledBy: {
    customer: 'Cancelled by the customer',
    merchant: 'Cancelled by the shop',
    admin: 'Cancelled by the Sougouba team',
    system: 'Cancelled: no courier available',
    shopNoResponse: 'Cancelled: the shop did not answer',
    unknown: 'Order cancelled',
  },
  courierIssueReason: {
    customer_absent: 'Customer not there',
    wrong_address: 'Wrong address',
    access_problem: 'Could not get in',
    shop_not_ready: 'Order not ready',
    order_incomplete: 'Order incomplete',
    other: 'Other',
  },
  loyaltyReason: {
    order_delivered: 'Order delivered',
    referral_referred: 'Referral — welcome to Sougouba',
    referral_referrer: 'Referral — a friend joined',
    redeemed: 'Used on an order',
    order_refunded: 'Order refunded',
  },
  shopHours: {
    closedToday: 'Closed today',
    openUntil: 'Open · closes at %{time}',
    opensAt: 'Opens at %{time}',
    reopensTomorrow: 'Closed · reopens tomorrow',
  },
  vertical: {
    grocery: {
      label: 'Grocery',
      title: 'Grocers',
      /**
       * Not "1 grocery / 2 groceries": in English "groceries" is the shopping,
       * not the shops. This is the argument for message-level plurals over
       * splicing an "s" onto a stored noun.
       */
      count: plural({ one: '%{count} grocery store', other: '%{count} grocery stores' }),
    },
    restaurant: {
      label: 'Restaurant',
      title: 'Restaurants',
      count: plural({ one: '%{count} restaurant', other: '%{count} restaurants' }),
    },
  },
  sort: {
    relevance: 'Relevance',
    price_asc: 'Price: low to high',
    price_desc: 'Price: high to low',
    name: 'Alphabetical',
  },
  priceBand: {
    all: 'All prices',
    under: 'Under %{amount}',
    between: '%{from} to %{to}',
    over: 'Over %{amount}',
  },
  vehicle: {
    bike: 'Bike',
    /** The stored value is `scooter`, and "Scooter" is the honest English word — the French label says "Moto". */
    scooter: 'Scooter',
    car: 'Car',
  },
};
