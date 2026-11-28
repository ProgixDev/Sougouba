import type { Shape } from '../../types';
import type { settings as fr } from '../fr/settings';

export const settings: Shape<typeof fr> = {
  title: 'Platform settings',
  description: 'Monetization and the loyalty program’s rules, applied across the whole platform.',
  saving: 'Saving…',
  readOnly: 'Read-only — your role does not allow changing the settings.',
  saved: 'Settings saved.',
  saveFailed: 'The settings could not be saved.',
  monetization: {
    title: 'Monetization',
    intro: 'Both apply to every merchant at the same time — a commission on each sale and a monthly subscription.',
    commissionRate: 'Commission rate (%)',
    commissionHelper: 'Calculated on the sales subtotal, excluding taxes and delivery.',
    monthlySubscription: 'Monthly subscription (CAD)',
  },
  subscriptionRule: {
    title: 'Subscription required to sell',
    intro:
      'When the subscription is required, an approved shop is shown to customers and receives orders only while its subscription is in order. Orders already placed are carried through. The shop comes back online by itself as soon as the subscription is paid.',
    stateOff: 'The subscription is not required: every approved shop can sell.',
    stateOn: 'The subscription is required.',
    impact: {
      one: '{notInOrder} of the {shops} approved shops has no subscription in order.',
      other: '{notInOrder} of the {shops} approved shops have no subscription in order.',
    },
    impactNone: 'All {shops} approved shops have a subscription in order.',
    notEnforceable:
      'The subscription cannot be required for now: no monthly amount is set, or Stripe is not configured on this server.',
    graceDays: 'Time allowed after a failed payment (days)',
    graceHelper: 'The shop keeps selling during this time, while Stripe retries the card. 0 = offline at the first failure.',
    saveGrace: 'Save the time allowed',
    graceSaved: 'Time allowed saved.',
    require: 'Require the subscription',
    stopRequiring: 'Stop requiring the subscription',
    requireTitle: 'Require the subscription?',
    requireBody: {
      one: '{count} shop will be taken offline right away, and its merchant will be told. It comes back online as soon as the subscription is paid.',
      other: '{count} shops will be taken offline right away, and their merchants will be told. They come back online as soon as the subscription is paid.',
    },
    requireBodyNone: 'No shop will be taken offline: all of them have a subscription in order.',
    stopTitle: 'Stop requiring the subscription?',
    stopBody: 'Shops offline for their subscription come back online right away, paid or not.',
    nowRequired: 'The subscription is now required.',
    noLongerRequired: 'The subscription is no longer required.',
  },
  loyalty: {
    title: 'Sougouba points (loyalty)',
    intro: 'Rules for the points program, coupons and referrals.',
    pointsPerCad: 'Points earned per $ spent',
    pointsPerCadRedeemed: 'Points needed for $1 off',
    redemptionCap: 'Redemption cap (% of the subtotal)',
    pointsExpiry: 'Points expiry (months)',
    referralPoints: 'Referral points (each party)',
    referralMinFirstOrder: 'Min. first order for a referral (CAD)',
    doublePointsTitle: 'Double points days',
    doublePointsBody: 'Temporarily doubles the points earned on every delivered order.',
  },
  shopConfirm: {
    title: 'Order with no response from the shop',
    intro:
      'The customer pays when ordering. If the shop does not accept the order, it gets a reminder, then the order is cancelled and the customer refunded in full. The delay counts from the time of the order.',
    remindAfter: 'Remind the shop after (minutes)',
    remindHelper: 'A notification on the shop’s phone, once only. 0 = no reminder.',
    cancelAfter: 'Cancel and refund after (minutes)',
    cancelHelper: 'Must be longer than the reminder delay. 0 = never automatically.',
  },
  courierLate: {
    title: 'Courier who does not come to pick up the order',
    intro:
      'A courier who accepts a delivery locks it for the others. Lateness is counted from the arrival time estimated when the courier accepted (based on their distance and vehicle). A withdrawn delivery goes back out to another courier; a delivery on which the courier has reported an incident is never withdrawn automatically.',
    remindAfter: 'Remind the courier after (minutes late)',
    remindHelper: 'A notification, once only. 0 = no reminder.',
    releaseAfter: 'Withdraw the delivery after (minutes late)',
    releaseHelper: 'Must be longer than the reminder delay. 0 = never automatically.',
  },
  noCourier: {
    title: 'Order ready, no courier',
    intro:
      'What happens when an order is ready and no courier takes it. The delay counts from the moment it is ready — or from the moment a courier gave it back.',
    alertAfter: 'Alert the team after (minutes)',
    alertHelper: 'An email to the team, and the order appears at the top of the Orders page.',
    cancelAfter: 'Cancel and refund after (minutes)',
    cancelHelper: 'Must be longer than the alert delay. 0 = never automatically: the team decides.',
  },
};
