/**
 * Whether a shop's monthly subscription lets it sell (CDC addendum v1.1, §05).
 *
 * One pure function, because this answer is given in four places that must
 * never disagree: the pass that takes shops offline and brings them back, the
 * merchant's screens, the back office, and the count an administrator is shown
 * before switching the rule on.
 *
 * The rule, in full:
 * - While the subscription is **not required**, every shop is in order.
 * - **Subscribed and paid** — in order.
 * - **A renewal failed** — still in order for `graceDays` from the moment the
 *   subscription became overdue, while Stripe retries the card; not after.
 * - **Never subscribed**, or **the subscription has ended** — not in order.
 */

/** The standings `merchant_subscriptions.status` holds — see `localStatus`. */
type SubscriptionStatus = 'inactive' | 'active' | 'past_due' | 'canceled';

export interface SubscriptionRule {
  /** False while the administrator has not required the subscription — or this deploy cannot bill one. */
  required: boolean;
  /** Days a shop keeps selling after its subscription first becomes overdue. */
  graceDays: number;
}

/** What is known about one shop's subscription. Null for a shop that never opened one. */
export interface SubscriptionFacts {
  status: SubscriptionStatus;
  /** When the subscription was first seen overdue; null while it is not. */
  pastDueSince: string | null;
}

/** Why a shop is not in order — or, for `past_due` within the grace, why it soon will not be. */
export type SubscriptionCause = 'never_subscribed' | 'past_due' | 'canceled';

export interface SubscriptionStanding {
  /** The shop may sell. */
  inOrder: boolean;
  cause: SubscriptionCause | null;
  /** Overdue but still within the grace: when the shop goes offline unless it pays. Null otherwise. */
  offlineAt: string | null;
}

const IN_ORDER: SubscriptionStanding = { inOrder: true, cause: null, offlineAt: null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function subscriptionStanding(
  rule: SubscriptionRule,
  facts: SubscriptionFacts | null,
  now: Date
): SubscriptionStanding {
  if (!rule.required) return IN_ORDER;

  switch (facts?.status) {
    case 'active':
      return IN_ORDER;
    case 'past_due': {
      // No date recorded yet means it was only just seen overdue: the grace
      // starts now rather than having silently run out.
      const since = facts.pastDueSince ? new Date(facts.pastDueSince).getTime() : now.getTime();
      const deadline = since + rule.graceDays * DAY_MS;
      return now.getTime() < deadline
        ? { inOrder: true, cause: 'past_due', offlineAt: new Date(deadline).toISOString() }
        : { inOrder: false, cause: 'past_due', offlineAt: null };
    }
    case 'canceled':
      return { inOrder: false, cause: 'canceled', offlineAt: null };
    default:
      return { inOrder: false, cause: 'never_subscribed', offlineAt: null };
  }
}
