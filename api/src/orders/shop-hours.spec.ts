import { describe, expect, it } from 'vitest';

import { closedShopMessage, montrealClock, nextOpening, type ShopHours } from './shop-hours.js';

/** Monday to Saturday 09:00–21:00, Sunday closed. */
const WEEK: ShopHours[] = [
  { day: 0, open: '09:00', close: '21:00', closed: true },
  ...[1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '09:00', close: '21:00', closed: false })),
];

// 2026-11-24 is a Tuesday. Montréal is UTC−5 in November, so 12:00 UTC is 07:00 there.
const at = (iso: string) => new Date(iso);

describe('the clock a shop lives by', () => {
  it('is Montréal’s, whatever the server’s timezone', () => {
    expect(montrealClock(at('2026-11-24T12:00:00Z'))).toEqual({ day: 2, minutes: 7 * 60 });
    // 03:30 UTC on Wednesday is still Tuesday evening in Montréal.
    expect(montrealClock(at('2026-11-25T03:30:00Z'))).toEqual({ day: 2, minutes: 22 * 60 + 30 });
  });

  it('follows daylight saving time', () => {
    // In July Montréal is UTC−4: 12:00 UTC is 08:00.
    expect(montrealClock(at('2026-07-07T12:00:00Z'))).toEqual({ day: 2, minutes: 8 * 60 });
  });
});

describe('when a closed shop opens next', () => {
  it('is later today, before opening time', () => {
    expect(nextOpening(WEEK, at('2026-11-24T12:00:00Z'))).toEqual({ daysAhead: 0, day: 2, open: '09:00' });
  });

  it('is tomorrow, after closing time — not this morning', () => {
    // Tuesday 22:30 in Montréal.
    expect(nextOpening(WEEK, at('2026-11-25T03:30:00Z'))).toEqual({ daysAhead: 1, day: 3, open: '09:00' });
  });

  it('skips a closed day', () => {
    // Saturday 22:00 in Montréal: Sunday is closed, so Monday.
    expect(nextOpening(WEEK, at('2026-11-29T03:00:00Z'))).toEqual({ daysAhead: 2, day: 1, open: '09:00' });
  });

  it('can be the same weekday next week', () => {
    const onlyTuesday: ShopHours[] = [{ day: 2, open: '10:30', close: '14:00', closed: false }];
    // Tuesday 15:00 in Montréal: already closed for the day, and for the rest of the week.
    expect(nextOpening(onlyTuesday, at('2026-11-24T20:00:00Z'))).toEqual({ daysAhead: 7, day: 2, open: '10:30' });
  });

  it('is unknown for a shop with no hours, or closed every day', () => {
    expect(nextOpening([], at('2026-11-24T12:00:00Z'))).toBeNull();
    expect(nextOpening(WEEK.map((h) => ({ ...h, closed: true })), at('2026-11-24T12:00:00Z'))).toBeNull();
  });

  it('ignores a day whose hours make no sense', () => {
    const broken: ShopHours[] = [
      { day: 2, open: '21:00', close: '09:00', closed: false },
      { day: 3, open: 'soon', close: '18:00', closed: false },
      { day: 4, open: '08:00', close: '18:00', closed: false },
    ];
    expect(nextOpening(broken, at('2026-11-24T12:00:00Z'))).toEqual({ daysAhead: 2, day: 4, open: '08:00' });
  });

  it('reads hours stored with seconds', () => {
    expect(nextOpening([{ day: 2, open: '09:00:00', close: '21:00:00', closed: false }], at('2026-11-24T12:00:00Z'))).toEqual({
      daysAhead: 0,
      day: 2,
      open: '09:00',
    });
  });
});

describe('what a shopper is told', () => {
  it('says when they can order, the way an hour is written in Quebec', () => {
    expect(closedShopMessage('Marché Teranga', { daysAhead: 0, day: 2, open: '09:00' })).toBe(
      'Marché Teranga est fermé pour le moment : vous pourrez commander aujourd’hui à 9 h.'
    );
    expect(closedShopMessage('Marché Teranga', { daysAhead: 1, day: 3, open: '09:30' })).toBe(
      'Marché Teranga est fermé pour le moment : vous pourrez commander demain à 9 h 30.'
    );
    expect(closedShopMessage('Marché Teranga', { daysAhead: 2, day: 1, open: '10:00' })).toBe(
      'Marché Teranga est fermé pour le moment : vous pourrez commander lundi à 10 h.'
    );
  });

  it('does not invent a time for a shop that lists none', () => {
    expect(closedShopMessage('Marché Teranga', null)).toBe('Marché Teranga est fermé pour le moment. Vous ne pouvez pas commander.');
  });
});
