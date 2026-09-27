import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { assertTransition, canCancel, isActiveStatus, nextStatus, STATUS_ACTOR } from './order-status.js';

describe('nextStatus', () => {
  it('walks the happy path and stops at delivered', () => {
    expect(nextStatus('pending')).toBe('confirmed');
    expect(nextStatus('confirmed')).toBe('preparing');
    expect(nextStatus('preparing')).toBe('ready');
    expect(nextStatus('ready')).toBe('out_for_delivery');
    expect(nextStatus('out_for_delivery')).toBe('delivered');
    expect(nextStatus('delivered')).toBeNull();
  });

  it('has no next step from outside the path', () => {
    expect(nextStatus('cancelled')).toBeNull();
  });
});

describe('STATUS_ACTOR', () => {
  it('ends the merchant’s job when the bag is packed', () => {
    // The two steps that describe someone physically carrying the order belong
    // to whoever is carrying it — the merchant must not be able to mark an
    // order delivered that no courier ever touched.
    expect(STATUS_ACTOR.preparing).toBe('merchant');
    expect(STATUS_ACTOR.ready).toBe('courier');
    expect(STATUS_ACTOR.out_for_delivery).toBe('courier');
    expect(STATUS_ACTOR.delivered).toBeNull();
    expect(STATUS_ACTOR.cancelled).toBeNull();
  });
});

describe('assertTransition', () => {
  it('allows the merchant their three steps', () => {
    expect(() => assertTransition('pending', 'confirmed', 'merchant')).not.toThrow();
    expect(() => assertTransition('confirmed', 'preparing', 'merchant')).not.toThrow();
    expect(() => assertTransition('preparing', 'ready', 'merchant')).not.toThrow();
  });

  it('refuses the merchant the courier’s steps', () => {
    // The escalation this closes: a merchant advancing `ready` -> delivered
    // would complete an order, trigger its loyalty credit and its courier
    // payout, with nobody having carried anything.
    expect(() => assertTransition('ready', 'out_for_delivery', 'merchant')).toThrow(ForbiddenException);
    expect(() => assertTransition('out_for_delivery', 'delivered', 'merchant')).toThrow(ForbiddenException);
  });

  it('refuses the courier the merchant’s steps', () => {
    expect(() => assertTransition('pending', 'confirmed', 'courier')).toThrow(ForbiddenException);
    expect(() => assertTransition('preparing', 'ready', 'courier')).toThrow(ForbiddenException);
  });

  it('refuses skipping a step, not just going backwards', () => {
    // An order that jumps `confirmed` -> `ready` never passed through a
    // kitchen, and its status history — which the dispute flow reads — says so.
    expect(() => assertTransition('confirmed', 'ready', 'merchant')).toThrow(ForbiddenException);
    expect(() => assertTransition('pending', 'delivered', 'merchant')).toThrow(ForbiddenException);
    expect(() => assertTransition('preparing', 'pending', 'merchant')).toThrow(ForbiddenException);
  });

  it('refuses any move out of a terminal status', () => {
    expect(() => assertTransition('delivered', 'cancelled', 'merchant')).toThrow(ForbiddenException);
    expect(() => assertTransition('cancelled', 'pending', 'merchant')).toThrow(ForbiddenException);
    expect(() => assertTransition('delivered', 'out_for_delivery', 'courier')).toThrow(ForbiddenException);
  });

  it('refuses a no-op', () => {
    expect(() => assertTransition('preparing', 'preparing', 'merchant')).toThrow(ForbiddenException);
  });
});

describe('canCancel', () => {
  it('lets the merchant cancel only while they still hold the bag', () => {
    expect(canCancel('pending', 'merchant')).toBe(true);
    expect(canCancel('confirmed', 'merchant')).toBe(true);
    expect(canCancel('preparing', 'merchant')).toBe(true);
    // Once a courier has it there is food in a car: that is a refund question,
    // not a cancellation.
    expect(canCancel('ready', 'merchant')).toBe(false);
    expect(canCancel('out_for_delivery', 'merchant')).toBe(false);
    expect(canCancel('delivered', 'merchant')).toBe(false);
  });

  it('never lets a courier cancel', () => {
    expect(canCancel('ready', 'courier')).toBe(false);
    expect(canCancel('pending', 'courier')).toBe(false);
  });

  it('is reachable through assertTransition for the merchant only', () => {
    expect(() => assertTransition('preparing', 'cancelled', 'merchant')).not.toThrow();
    expect(() => assertTransition('preparing', 'cancelled', 'courier')).toThrow(ForbiddenException);
    expect(() => assertTransition('out_for_delivery', 'cancelled', 'merchant')).toThrow(ForbiddenException);
  });
});

describe('isActiveStatus', () => {
  it('counts everything except delivered and cancelled', () => {
    expect(isActiveStatus('pending')).toBe(true);
    expect(isActiveStatus('out_for_delivery')).toBe(true);
    expect(isActiveStatus('delivered')).toBe(false);
    expect(isActiveStatus('cancelled')).toBe(false);
  });
});
