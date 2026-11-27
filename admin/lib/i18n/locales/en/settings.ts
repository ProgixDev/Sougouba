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
