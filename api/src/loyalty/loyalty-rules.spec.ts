import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOYALTY_RATES,
  isDoublePointsActive,
  pointsEarnedFor,
  pointsExpiryFrom,
  qualifiesForReferralReward,
  type LoyaltyRates,
} from './loyalty-rules.js';

const rates = (overrides: Partial<LoyaltyRates> = {}): LoyaltyRates => ({ ...DEFAULT_LOYALTY_RATES, ...overrides });

describe('pointsEarnedFor', () => {
  it('earns 1 point per dollar of subtotal, floored', () => {
    // A shopper does not earn a fractional point on the cents.
    expect(pointsEarnedFor(60, rates())).toBe(60);
    expect(pointsEarnedFor(60.99, rates())).toBe(60);
    expect(pointsEarnedFor(0, rates())).toBe(0);
  });

  it('never earns on a negative subtotal', () => {
    expect(pointsEarnedFor(-50, rates())).toBe(0);
  });

  it('follows an admin-changed rate', () => {
    // The whole reason these are parameters: the brief puts the rates under an
    // administrator's control, so a changed rate has to take effect without a
    // deploy.
    expect(pointsEarnedFor(60, rates({ pointsPerCad: 2 }))).toBe(120);
  });
});

describe('isDoublePointsActive', () => {
  const jan15 = new Date('2026-01-15T12:00:00Z');

  it('is off unless the toggle is on', () => {
    expect(isDoublePointsActive(rates(), jan15)).toBe(false);
  });

  it('is on with the toggle and no window — the old boolean’s behaviour', () => {
    expect(isDoublePointsActive(rates({ doublePointsActive: true }), jan15)).toBe(true);
  });

  it('respects a window, so a promotion ends itself', () => {
    // The failure this prevents: an admin flips the switch for one Saturday and
    // forgets to flip it back, doubling every point the platform issues
    // indefinitely.
    const windowed = rates({
      doublePointsActive: true,
      doublePointsStartsAt: new Date('2026-01-10T00:00:00Z'),
      doublePointsEndsAt: new Date('2026-01-11T00:00:00Z'),
    });
    expect(isDoublePointsActive(windowed, new Date('2026-01-09T23:59:00Z'))).toBe(false);
    expect(isDoublePointsActive(windowed, new Date('2026-01-10T00:00:00Z'))).toBe(true);
    expect(isDoublePointsActive(windowed, new Date('2026-01-10T23:59:00Z'))).toBe(true);
    // End-exclusive, matching how shop hours are treated elsewhere.
    expect(isDoublePointsActive(windowed, new Date('2026-01-11T00:00:00Z'))).toBe(false);
  });

  it('doubles what an order earns while it runs', () => {
    const on = rates({ doublePointsActive: true });
    expect(pointsEarnedFor(60, on, jan15)).toBe(120);
  });
});

describe('pointsExpiryFrom', () => {
  it('expires twelve months after the earn', () => {
    expect(pointsExpiryFrom(new Date('2026-01-15T12:00:00Z'), rates())).toEqual(new Date('2027-01-15T12:00:00Z'));
  });

  it('rolls a month-end date without inventing a day', () => {
    // 31 August + 12 months is 31 August, not 1 September — but `setMonth` on a
    // 31st into a 30-day month rolls forward, so this pins the behaviour rather
    // than assuming it.
    expect(pointsExpiryFrom(new Date('2026-08-31T12:00:00Z'), rates())).toEqual(new Date('2027-08-31T12:00:00Z'));
  });
});

describe('qualifiesForReferralReward', () => {
  it('needs the first order to clear 60 $ before tax and delivery', () => {
    expect(qualifiesForReferralReward(59.99, rates())).toBe(false);
    expect(qualifiesForReferralReward(60, rates())).toBe(true);
    expect(qualifiesForReferralReward(120, rates())).toBe(true);
  });

  it('measures the subtotal, so tax and delivery cannot push an order over the line', () => {
    // A 55 $ basket reaches 63,20 $ once tax and delivery are added. The brief
    // says the floor is on the goods, and this is where that is enforced.
    expect(qualifiesForReferralReward(55, rates())).toBe(false);
  });
});
