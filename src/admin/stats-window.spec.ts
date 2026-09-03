import { describe, expect, it } from 'vitest';

import { deltaPct, montrealDate, montrealMidnight, overviewWindow, round2 } from './stats-window.js';

describe('montrealDate', () => {
  it('files a late-evening Montreal order under that evening, not the next UTC day', () => {
    // 23:30 EDT on 15 June = 03:30 UTC on 16 June. Bucketing in UTC would
    // credit this order to the 16th and leave a visible hole in the chart.
    expect(montrealDate(new Date('2026-06-16T03:30:00Z'))).toBe('2026-06-15');
  });

  it('rolls over at Montreal midnight, not UTC midnight', () => {
    expect(montrealDate(new Date('2026-06-16T04:00:00Z'))).toBe('2026-06-16');
  });
});

describe('montrealMidnight', () => {
  it('resolves to 04:00 UTC on daylight time (UTC-4)', () => {
    expect(montrealMidnight('2026-06-15').toISOString()).toBe('2026-06-15T04:00:00.000Z');
  });

  it('resolves to 05:00 UTC on standard time (UTC-5)', () => {
    expect(montrealMidnight('2026-01-15').toISOString()).toBe('2026-01-15T05:00:00.000Z');
  });

  it('is the exact instant the Montreal calendar day begins', () => {
    const midnight = montrealMidnight('2026-06-15');
    expect(montrealDate(midnight)).toBe('2026-06-15');
    // One millisecond earlier still belongs to the previous day.
    expect(montrealDate(new Date(midnight.getTime() - 1))).toBe('2026-06-14');
  });

  it('lands on the right instant on the spring-forward day, when 02:00 never happens', () => {
    // 8 March 2026: clocks jump 02:00 → 03:00. Midnight itself is still UTC-5.
    expect(montrealMidnight('2026-03-08').toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('lands on the right instant on the fall-back day, when 01:00 happens twice', () => {
    // 1 November 2026: clocks fall 02:00 → 01:00. Midnight is still UTC-4.
    expect(montrealMidnight('2026-11-01').toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });
});

describe('overviewWindow', () => {
  const now = new Date('2026-06-15T18:00:00Z');

  it.each([7, 30, 90] as const)('returns exactly %i day buckets', (range) => {
    expect(overviewWindow(range, now).days).toHaveLength(range);
  });

  it('ends on today and starts range-1 days earlier', () => {
    const { days } = overviewWindow(7, now);
    expect(days.at(-1)).toBe('2026-06-15');
    expect(days[0]).toBe('2026-06-09');
  });

  it('produces strictly ascending, unique dates', () => {
    const { days } = overviewWindow(30, now);
    expect([...days].sort()).toEqual(days);
    expect(new Set(days).size).toBe(days.length);
  });

  it('leaves no gap or overlap between the two windows', () => {
    const w = overviewWindow(30, now);
    expect(w.prevEnd.getTime()).toBe(w.curStart.getTime());
    expect(w.prevStart.getTime()).toBeLessThan(w.prevEnd.getTime());
  });

  it('gives the previous window the same number of days as the current one', () => {
    const w = overviewWindow(30, now);
    const dayMs = 86_400_000;
    // Both windows span 30 calendar days; the previous one is whole, so its
    // length is exact apart from the one-hour DST wobble a span can carry.
    const spanDays = (w.prevEnd.getTime() - w.prevStart.getTime()) / dayMs;
    expect(spanDays).toBeGreaterThan(29.9);
    expect(spanDays).toBeLessThan(30.1);
  });

  it('still returns 30 buckets across the November fall-back — not 29 or 31', () => {
    // The day this silently breaks if calendar arithmetic is done by
    // subtracting 86400000 ms from a local timestamp.
    const { days } = overviewWindow(30, new Date('2026-11-10T18:00:00Z'));
    expect(days).toHaveLength(30);
    expect(days).toContain('2026-11-01');
    expect(new Set(days).size).toBe(30);
  });

  it('still returns 30 buckets across the March spring-forward', () => {
    const { days } = overviewWindow(30, new Date('2026-03-20T18:00:00Z'));
    expect(days).toHaveLength(30);
    expect(days).toContain('2026-03-08');
    expect(new Set(days).size).toBe(30);
  });

  it('crosses a year boundary without repeating or skipping a date', () => {
    const { days } = overviewWindow(30, new Date('2027-01-10T18:00:00Z'));
    expect(days).toHaveLength(30);
    expect(days).toContain('2026-12-31');
    expect(days).toContain('2027-01-01');
  });

  it('handles a leap day', () => {
    const { days } = overviewWindow(7, new Date('2028-03-02T18:00:00Z'));
    expect(days).toContain('2028-02-29');
    expect(days).toHaveLength(7);
  });

  it('starts the current window at Montreal midnight of the first bucket', () => {
    const w = overviewWindow(7, now);
    expect(w.curStart.toISOString()).toBe(montrealMidnight('2026-06-09').toISOString());
  });
});

describe('deltaPct', () => {
  it('reports growth from nothing as 0, never Infinity — that renders as text in a stat card', () => {
    expect(deltaPct(100, 0)).toBe(0);
  });

  it('reports 0 rather than NaN when both periods are empty', () => {
    expect(deltaPct(0, 0)).toBe(0);
  });

  it('reports a total collapse as -100', () => {
    expect(deltaPct(0, 100)).toBe(-100);
  });

  it('computes an ordinary increase and decrease', () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(75, 100)).toBe(-25);
  });

  it('rounds to two decimals rather than emitting a float tail', () => {
    expect(deltaPct(1, 3)).toBe(-66.67);
  });

  it('treats a negative previous period as no baseline', () => {
    expect(deltaPct(50, -10)).toBe(0);
  });
});

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(42.4999)).toBe(42.5);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(0)).toBe(0);
  });

  it('inherits float32 half-way behaviour — 1.005 rounds DOWN, matching the dashboard mock', () => {
    // `1.005 * 100` is 100.49999999999999 in IEEE-754, so `Math.round` gives
    // 100. Pinned deliberately rather than "fixed": this is a reporting
    // rounding, and it must agree digit-for-digit with the `round2` in the
    // dashboard's `admin/lib/api/stats.ts`, which is the same expression.
    // Money that must be exact is computed in `numeric` by Postgres, never here.
    expect(round2(1.005)).toBe(1);
  });
});
