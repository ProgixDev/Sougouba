import { describe, expect, it } from 'vitest';

import { subscriptionStanding, type SubscriptionFacts } from './subscription-standing.js';

const NOW = new Date('2026-12-10T15:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const required = { required: true, graceDays: 7 };
const facts = (status: SubscriptionFacts['status'], pastDueSince: string | null = null): SubscriptionFacts => ({ status, pastDueSince });

describe('a shop’s subscription, while it is not required', () => {
  it('lets every shop sell, whatever its subscription', () => {
    const optional = { required: false, graceDays: 7 };
    const all = [null, facts('inactive'), facts('active'), facts('past_due', daysAgo(90)), facts('canceled')];
    for (const shop of all) {
      expect(subscriptionStanding(optional, shop, NOW)).toEqual({ inOrder: true, cause: null, offlineAt: null });
    }
  });
});

describe('a shop’s subscription, once it is required', () => {
  it('is in order when subscribed and paid', () => {
    expect(subscriptionStanding(required, facts('active'), NOW)).toEqual({ inOrder: true, cause: null, offlineAt: null });
  });

  it('is not in order for a shop that never subscribed — with or without a row', () => {
    const never = { inOrder: false, cause: 'never_subscribed', offlineAt: null };
    expect(subscriptionStanding(required, null, NOW)).toEqual(never);
    // A row with no subscription: the shop linked its bank account, or opened a checkout it never finished.
    expect(subscriptionStanding(required, facts('inactive'), NOW)).toEqual(never);
  });

  it('is not in order once the subscription has ended', () => {
    expect(subscriptionStanding(required, facts('canceled'), NOW)).toEqual({ inOrder: false, cause: 'canceled', offlineAt: null });
  });
});

describe('a failed renewal', () => {
  it('leaves the shop selling for the grace period, and says when that ends', () => {
    expect(subscriptionStanding(required, facts('past_due', daysAgo(3)), NOW)).toEqual({
      inOrder: true,
      cause: 'past_due',
      // Seven days after it became overdue, three of which have gone.
      offlineAt: new Date(NOW.getTime() + 4 * 86_400_000).toISOString(),
    });
  });

  it('takes the shop offline when the grace period is over — to the minute', () => {
    const justInside = new Date(NOW.getTime() - 7 * 86_400_000 + 60_000).toISOString();
    expect(subscriptionStanding(required, facts('past_due', justInside), NOW).inOrder).toBe(true);
    expect(subscriptionStanding(required, facts('past_due', daysAgo(7)), NOW)).toEqual({
      inOrder: false,
      cause: 'past_due',
      offlineAt: null,
    });
  });

  it('takes the shop offline at once when no grace is given', () => {
    const none = { required: true, graceDays: 0 };
    expect(subscriptionStanding(none, facts('past_due', NOW.toISOString()), NOW).inOrder).toBe(false);
    expect(subscriptionStanding(none, facts('past_due'), NOW).inOrder).toBe(false);
  });

  it('starts the grace now when the date it became overdue was never recorded', () => {
    // Rather than treating a missing date as "long ago" and pulling a shop that was just seen overdue.
    expect(subscriptionStanding(required, facts('past_due'), NOW)).toEqual({
      inOrder: true,
      cause: 'past_due',
      offlineAt: new Date(NOW.getTime() + 7 * 86_400_000).toISOString(),
    });
  });

  it('follows the grace the administrator sets', () => {
    const overdue = facts('past_due', daysAgo(10));
    expect(subscriptionStanding({ required: true, graceDays: 7 }, overdue, NOW).inOrder).toBe(false);
    expect(subscriptionStanding({ required: true, graceDays: 14 }, overdue, NOW).inOrder).toBe(true);
  });
});
