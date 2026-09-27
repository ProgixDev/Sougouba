import { describe, expect, it } from 'vitest';

import {
  BASE_FARE_CAD,
  courierEarnings,
  courierFare,
  generateDeliveryPin,
  legDurationMin,
  pinMatches,
  VEHICLE_SPEED_KMH,
} from './courier-pay.js';

describe('courierFare', () => {
  it('is a flat pickup fee plus a rate per kilometre', () => {
    expect(courierFare(0)).toBe(3.5);
    expect(courierFare(5)).toBe(8);
    expect(courierFare(2.5)).toBe(5.75);
  });

  it('treats a negative distance as zero rather than paying backwards', () => {
    expect(courierFare(-5)).toBe(BASE_FARE_CAD);
  });
});

describe('courierEarnings', () => {
  it('passes the tip through untouched, on top of the fare', () => {
    // The tip is not revenue the platform touches — it carries no commission,
    // which is why it is added rather than folded into the fare.
    expect(courierEarnings(5, 3)).toBe(11);
    expect(courierEarnings(5)).toBe(8);
  });

  it('ignores a negative tip', () => {
    expect(courierEarnings(5, -10)).toBe(8);
  });
});

describe('legDurationMin', () => {
  it('uses city speeds, not spec-sheet speeds', () => {
    // A car is barely faster than a scooter across Montréal once parking and
    // lights are counted.
    expect(VEHICLE_SPEED_KMH.car).toBeLessThan(VEHICLE_SPEED_KMH.scooter);
    expect(legDurationMin(5, 'bike')).toBe(20);
    expect(legDurationMin(5, 'scooter')).toBe(12);
    expect(legDurationMin(5, 'car')).toBe(14);
  });

  it('never returns zero — arriving instantly reads as broken', () => {
    expect(legDurationMin(0, 'car')).toBe(1);
    expect(legDurationMin(0.01, 'car')).toBe(1);
    expect(legDurationMin(-5, 'bike')).toBe(1);
  });
});

describe('generateDeliveryPin', () => {
  it('is always four digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateDeliveryPin()).toMatch(/^\d{4}$/);
    }
  });

  it('is not derived from anything — two PINs in a row differ', () => {
    // The property the mock's PIN lacked. `data/delivery.ts` derived it from
    // the order id and admitted in its own comment that "anyone holding the
    // order can compute it" — but the order id travels in URLs, push payloads
    // and the merchant's dashboard, so it proved nothing about who was at the
    // door. 200 draws collapsing to a handful of values would mean the entropy
    // is gone.
    const drawn = new Set(Array.from({ length: 200 }, generateDeliveryPin));
    expect(drawn.size).toBeGreaterThan(100);
  });
});

describe('pinMatches', () => {
  it('accepts the right PIN and rejects everything else', () => {
    expect(pinMatches('0427', '0427')).toBe(true);
    expect(pinMatches('0427', '0428')).toBe(false);
    expect(pinMatches('0427', '')).toBe(false);
    expect(pinMatches('0427', '04270')).toBe(false);
  });

  it('does not treat a leading-zero PIN as a number', () => {
    // `String(pin) === String(provided)` is the whole comparison, so "0427"
    // never collapses to 427.
    expect(pinMatches('0427', '427')).toBe(false);
  });
});
