import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ALLOWED_TRANSITIONS, VENDOR_TRANSITIONS, assertDecision } from './approvals.service.js';

describe('assertDecision', () => {
  it('lets an administrator decide a waiting file', () => {
    expect(() => assertDecision('pending', 'approved')).not.toThrow();
    expect(() => assertDecision('pending', 'rejected')).not.toThrow();
  });

  it('refuses to suspend a file that never traded', () => {
    // Suspension takes something away from someone who had it. A file that
    // never opened gets rejected instead — conflating the two is how a merchant
    // reads that a shop they never opened has been taken offline.
    expect(() => assertDecision('pending', 'suspended')).toThrow(BadRequestException);
  });

  it('refuses to approve a rejected file', () => {
    // Rejection is a decision about paperwork that was found wanting. The way
    // back is a fresh application with fixed paperwork, not an administrator
    // quietly toggling it later.
    expect(() => assertDecision('rejected', 'approved')).toThrow(BadRequestException);
    expect(() => assertDecision('rejected', 'suspended')).toThrow(BadRequestException);
    expect(ALLOWED_TRANSITIONS.rejected).toEqual([]);
  });

  it('allows suspending a trading shop and reinstating it', () => {
    // The one reversal that makes sense: the shop traded before, and whatever
    // caused the suspension can be resolved.
    expect(() => assertDecision('approved', 'suspended')).not.toThrow();
    expect(() => assertDecision('suspended', 'approved')).not.toThrow();
  });

  it('refuses to reject a shop that is already trading', () => {
    // There is a decision for that and it is "suspend" — rejecting would erase
    // the fact it was ever approved.
    expect(() => assertDecision('approved', 'rejected')).toThrow(BadRequestException);
  });

  it('refuses a no-op rather than accepting it silently', () => {
    // A second approval would overwrite the reviewer and timestamp of the
    // first, which is the audit trail.
    expect(() => assertDecision('approved', 'approved')).toThrow(BadRequestException);
    expect(() => assertDecision('pending', 'pending')).toThrow(BadRequestException);
  });

  it('has no path back to pending from anywhere', () => {
    // A decided file does not return to the queue; that would lose who decided
    // it and why.
    for (const from of ['approved', 'suspended', 'rejected'] as const) {
      expect(ALLOWED_TRANSITIONS[from]).not.toContain('pending');
    }
  });
});

describe('a shop offline for its subscription', () => {
  const decide = (from: Parameters<typeof assertDecision>[0], to: Parameters<typeof assertDecision>[1]) => () =>
    assertDecision(from, to, VENDOR_TRANSITIONS);

  it('can still be suspended — a shop can misbehave whether or not it has paid', () => {
    expect(decide('subscription_hold', 'suspended')).not.toThrow();
  });

  it('cannot be approved back online by hand: the way out is the subscription', () => {
    expect(decide('subscription_hold', 'approved')).toThrow(BadRequestException);
    expect(decide('subscription_hold', 'rejected')).toThrow(BadRequestException);
  });

  it('is not a decision a courier file can be in', () => {
    // The couriers' table has no such status; asked about one, it refuses rather than crashing.
    expect(() => assertDecision('subscription_hold', 'suspended')).toThrow(BadRequestException);
  });

  it('leaves every other decision on a shop as it was', () => {
    for (const from of ['pending', 'approved', 'suspended', 'rejected'] as const) {
      expect(VENDOR_TRANSITIONS[from]).toEqual(ALLOWED_TRANSITIONS[from]);
    }
  });
});
